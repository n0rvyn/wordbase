#!/usr/bin/env python3
"""One scoped origin cutover; only Wordbase API may restart. No source copies."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from urllib.request import Request, urlopen
from urllib.parse import urlsplit, parse_qsl, urlencode, urlunsplit

ALLOWED = {
 '.env.example', 'content/site-origin.json', 'packages/web/astro.config.mjs', 'packages/web/public/robots.txt',
 'packages/api/src/app.ts', 'packages/api/src/lib/site-origin.ts',
 'packages/api/src/services/seo-health.service.ts', 'packages/api/src/__tests__/site-origin.test.ts',
 'deploy/domain-release.py', 'deploy/seo-release.py', 'deploy/setup.sh',
 'scripts/test-domain-release.py', 'scripts/test-seo-release.py',
 'package.json', 'packages/api/package.json', 'CHANGELOG.md', 'MCP-TOOLS.md',
}

def common(root):
 spec=importlib.util.spec_from_file_location('wordbase_static_release',root/'deploy/seo-release.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 return module

def normalize_link(link):
 if not link:return link
 url=urlsplit(link)
 if url.scheme=='https' and url.netloc in ('norvyn.com','julian.cafe'):
  return '{site}'+url.path+('?' + url.query if url.query else '')+('#'+url.fragment if url.fragment else '')
 if url.scheme=='https' and url.netloc=='twitter.com' and url.path=='/intent/tweet':
  fields=[(key,normalize_link(value) if key=='url' else value) for key,value in parse_qsl(url.query,keep_blank_values=True)]
  return urlunsplit((url.scheme,url.netloc,url.path,urlencode(fields),url.fragment))
 return link

def migration_snapshot(release, dist):
 snapshot=release.snapshot(dist)
 for rel in snapshot['pages']:
  page=release.Page((dist/rel).read_text())
  # Only domain aliases are equivalent. Text, paths, queries and external links stay exact.
  page.links=[normalize_link(link) for link in page.links]
  snapshot['pages'][rel]=page.signature()
 return snapshot

def validate_migration(release, candidate, previous, origin):
 current=migration_snapshot(release,candidate)
 if current['pages']!=previous['pages']:raise ValueError('Public content, paths or links changed')
 if current['ids']!=previous['ids']:raise ValueError('Published feed IDs changed')
 expected={u.replace('https://norvyn.com',origin,1) for u in previous['urls']}
 if set(current['urls'])!=expected:raise ValueError('Sitemap paths changed')
 return release.validate(candidate,release.snapshot(candidate),expected_origin=origin)

def public_environment(raw, origin):
 if not re.fullmatch(r'https://[a-z0-9.-]+',origin):raise ValueError('Invalid canonical origin')
 lines=raw.splitlines(keepends=True)
 matches=[i for i,line in enumerate(lines) if line.startswith('PUBLIC_SITE_URL=')]
 if len(matches)>1:raise ValueError('Duplicate public origin setting')
 if matches:lines[matches[0]]='PUBLIC_SITE_URL='+origin+'\n'
 else:lines.append(('' if not raw or raw.endswith('\n') else '\n')+'PUBLIC_SITE_URL='+origin+'\n')
 return ''.join(lines)

def restart_api():
 subprocess.run(['systemctl','restart','wordbase-api'],check=True)

def healthy_api():
 for _ in range(40):
  try:
   with urlopen(Request('http://127.0.0.1:4100/health',headers={'Origin':'https://julian.cafe'}),timeout=2) as r:
    if r.status==200 and json.load(r).get('status')=='healthy' and r.headers.get('Access-Control-Allow-Origin')=='https://julian.cafe':return
  except (OSError,ValueError):pass
  time.sleep(.25)
 raise RuntimeError('Wordbase API health/CORS check failed')

def activate(api_candidate, api_live, web_candidate, web_live, env_file, origin, swap, restart=restart_api, health=healthy_api):
 """Rollback uses only transient generated artifacts and in-memory env bytes."""
 if any(p.is_symlink() for p in (api_candidate,api_live,web_candidate,web_live,env_file)):
  raise ValueError('Unexpected release symlink')
 raw=env_file.read_text();api_switched=False;web_switched=False
 api_inode=api_live.stat().st_ino;web_inode=web_live.stat().st_ino
 try:
  env_file.write_text(public_environment(raw,origin))
  swap(api_candidate,api_live);api_switched=True
  restart();health()
  swap(web_candidate,web_live);web_switched=True
 except BaseException:
  api_switched=api_live.stat().st_ino!=api_inode
  web_switched=web_live.stat().st_ino!=web_inode
  if web_switched:swap(web_candidate,web_live)
  if api_switched:swap(api_candidate,api_live)
  env_file.write_text(raw)
  if api_switched:restart()
  raise

def main(root,base,target):
 root=Path(root).resolve(strict=True);s=common(root);git=lambda *args:s.git(root,*args)
 if git('rev-parse','HEAD')!=base or git('symbolic-ref','--short','HEAD')!='main':raise ValueError('Unexpected base')
 if git('status','--porcelain','--untracked-files=no'):raise ValueError('Preserve tracked changes')
 if git('rev-parse','origin/main')!=target:raise ValueError('Unreviewed remote target')
 subprocess.run(['git','-C',str(root),'merge-base','--is-ancestor',base,target],check=True)
 changed=set(git('diff','--name-only',base,target).splitlines())
 if not changed or not changed<=ALLOWED:raise ValueError('Unrelated cutover changes')
 for name in ('package.json','packages/api/package.json'):
  a=json.loads(git('show',base+':'+name));b=json.loads(git('show',target+':'+name))
  a.pop('version',None);b.pop('version',None)
  if a!=b:raise ValueError('Dependency or script change')
 if shutil.disk_usage(root).free<800*1024*1024:raise ValueError('Insufficient release space')
 subprocess.run(['python3',str(root/'deploy/release_guard.py'),'inventory',str(root)],check=True,stdout=subprocess.DEVNULL)
 web=root/'packages/web/dist';api=root/'packages/api/dist';env_file=root/'.env'
 previous_raw=s.snapshot(web);previous=migration_snapshot(s,web)
 old_api_inode=api.stat().st_ino;old_web_inode=web.stat().st_ino
 locks=[];stage=None;updated=False;activated=False
 try:
  for name in ('.deployment.lock','.release.lock'):
   fd=os.open(root/'packages/api/data'/name,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
   lock=os.fdopen(fd,'r+');locks.append(lock);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if git('rev-parse','HEAD')!=base or git('status','--porcelain','--untracked-files=no'):raise ValueError('Concurrent checkout change')
  stage=Path(tempfile.mkdtemp(prefix='.release-stage.domain-',dir=root))
  a,b=stage/'probe-a',stage/'probe-b';a.mkdir();b.mkdir();s.exchange(a,b);a.rmdir();b.rmdir()
  subprocess.run(['git','-C',str(root),'merge','--ff-only',target],check=True);updated=True
  s=common(root)
  origin=json.loads((root/'content/site-origin.json').read_text())['canonical']
  if origin!='https://julian.cafe':raise ValueError('Unexpected cutover origin')
  candidate_api=stage/'api-dist';candidate_web=stage/'web-dist'
  subprocess.run(['pnpm','--filter','api','build','--outDir',str(candidate_api)],cwd=root,check=True)
  env={**os.environ,'API_URL':'http://127.0.0.1:4100','PUBLIC_SITE_URL':origin,'ASTRO_TELEMETRY_DISABLED':'1'}
  subprocess.run(['pnpm','--filter','web','build','--outDir',str(candidate_web)],cwd=root,env=env,check=True)
  result=validate_migration(s,candidate_web,previous,origin)
  if not (candidate_api/'index.js').is_file():raise ValueError('Incomplete API output')
  for candidate,reference in ((candidate_api,api/'index.js'),(candidate_web,web/'index.html')):
   subprocess.run(['chown','-R','caddy:caddy',str(candidate)],check=True)
   subprocess.run(['chcon','-R','--reference='+str(reference),str(candidate)],check=True)
  activate(candidate_api,api,candidate_web,web,env_file,origin,s.exchange);activated=True
  print(json.dumps({'deployed':target,'canonical':origin,**result,'apiRestarted':True,'sharedServicesTouched':False,'checkpointCreated':False,'podcastRuntimeOriginPreserved':True}))
 except BaseException:
  if updated and not activated and s.snapshot(web)==previous_raw:
   subprocess.run(['git','-C',str(root),'restore','--source='+base,'--staged','--worktree','--',*sorted(changed)],check=True)
   subprocess.run(['git','-C',str(root),'reset','--soft',base],check=True)
  raise
 finally:
  # Never destroy the only old generated artifacts after uncertain recovery.
  recovered=api.stat().st_ino==old_api_inode and web.stat().st_ino==old_web_inode
  if stage and stage.exists() and (activated or recovered):shutil.rmtree(stage)
  for lock in reversed(locks):lock.close()

if __name__=='__main__':
 if len(sys.argv)!=4:raise SystemExit('usage: domain-release.py ROOT BASE TARGET')
 def interrupted(*_):raise SystemExit('Domain release interrupted; recovering scoped artifacts')
 signal.signal(signal.SIGTERM,interrupted)
 main(*sys.argv[1:])
