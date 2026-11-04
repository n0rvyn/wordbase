#!/usr/bin/env python3
"""SEO-only static release. No source copies, backups, DB writes or service actions."""
import ctypes
import errno
import fcntl
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlparse
import xml.etree.ElementTree as ET

SEO_FILES = {
 'packages/web/public/robots.txt', 'packages/web/src/lib/blog-feed.ts',
 'packages/web/src/lib/blog-feed.test.ts', 'packages/web/src/lib/jsonld.ts',
 'packages/web/src/lib/jsonld.test.ts', 'packages/web/src/pages/404.astro',
 'packages/web/src/pages/en/404.astro', 'packages/web/src/pages/en/apps/[slug].astro',
 'packages/web/src/pages/en/posts/[slug].astro', 'packages/web/src/pages/posts/[slug].astro',
 'deploy/setup.sh', 'deploy/seo-release.py', 'scripts/test-seo-release.py',
 'package.json', 'packages/api/package.json', 'CHANGELOG.md', 'MCP-TOOLS.md',
}


def git(root, *args):
 return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()


def exchange(left, right):
 """Linux atomic directory exchange: either both names change or neither does."""
 libc = ctypes.CDLL(None, use_errno=True)
 rename = getattr(libc, 'renameat2', None)
 if rename is None:
  raise OSError(errno.ENOSYS, 'Atomic directory exchange unavailable')
 rename.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
 rename.restype = ctypes.c_int
 if rename(-100, os.fsencode(left), -100, os.fsencode(right), 2):
  code = ctypes.get_errno()
  raise OSError(code, os.strerror(code))


class Page(HTMLParser):
 def __init__(self, raw):
  super().__init__(); self.body=False; self.skip=0; self.text=[]; self.links=[]
  self.canonical=[]; self.og=[]; self.description=[]; self.robots=[]
  self.feed(raw)
 def handle_starttag(self, tag, attrs):
  a=dict(attrs)
  if tag=='body': self.body=True
  if tag=='link' and a.get('rel')=='canonical': self.canonical.append(a.get('href'))
  if tag=='meta':
   if a.get('property')=='og:url': self.og.append(a.get('content'))
   if a.get('name')=='description': self.description.append(a.get('content'))
   if a.get('name')=='robots': self.robots.append(a.get('content',''))
  if self.body:
   if tag in ('script','style'): self.skip+=1
   if tag=='a': self.links.append(a.get('href'))
 def handle_endtag(self,tag):
  if tag in ('script','style') and self.skip: self.skip-=1
  if tag=='body': self.body=False
 def handle_data(self,data):
  if self.body and not self.skip: self.text.append(data)
 def signature(self):
  return hashlib.sha256(json.dumps([' '.join(' '.join(self.text).split()), self.links],ensure_ascii=False).encode()).hexdigest()


def snapshot(dist):
 """Only in-memory hashes/IDs, never a content or output backup."""
 pages={}
 for f in dist.rglob('*.html'):
  rel=f.relative_to(dist).as_posix()
  if rel.startswith('admin'): continue
  pages[rel]=Page(f.read_text()).signature()
 feed=ET.parse(dist/'rss.xml')
 ids=[(x.findtext('guid'),dict(x.find('guid').attrib)) for x in feed.findall('./channel/item')]
 urls=[x.text for x in ET.parse(dist/'sitemap.xml').findall('.//{*}loc')]
 return {'pages':pages,'ids':ids,'urls':urls}


def validate(candidate, previous):
 current=snapshot(candidate)
 for rel, digest in previous['pages'].items():
  if current['pages'].get(rel)!=digest: raise ValueError('Public body/links changed: '+rel)
 if current['ids']!=previous['ids']: raise ValueError('Published feed IDs changed')
 if set(current['urls'])!=set(previous['urls']): raise ValueError('Sitemap route set changed')
 if len(current['urls'])!=len(set(current['urls'])): raise ValueError('Duplicate sitemap URLs')
 for url in current['urls']:
  path=unquote(urlparse(url).path)
  file=candidate/('index.html' if path=='/' else path.lstrip('/')+'.html')
  if not file.is_file(): raise ValueError('Missing sitemap target: '+path)
 for rel in current['pages']:
  p=Page((candidate/rel).read_text())
  if len(p.canonical)!=1 or p.canonical!=p.og or len(p.description)!=1:
   raise ValueError('Invalid metadata: '+rel)
  if urlparse(p.canonical[0]).netloc!='norvyn.com': raise ValueError('Canonical origin changed')
  if rel in ('404.html','en/404.html','search.html','en/search.html') and not any('noindex' in x for x in p.robots):
   raise ValueError('Utility page indexable: '+rel)
 return {'publicPages':len(current['pages']), 'feedItems':len(current['ids']), 'sitemapUrls':len(current['urls'])}


def promote(candidate, live, swap=exchange):
 if candidate.is_symlink() or live.is_symlink() or not candidate.is_dir() or not live.is_dir():
  raise ValueError('Static directories must be real directories')
 if candidate.stat().st_dev!=live.stat().st_dev: raise ValueError('Static promotion crosses filesystems')
 if not (candidate/'index.html').is_file(): raise ValueError('Incomplete static output')
 swap(candidate, live)
 # The obsolete generated output now has the candidate name. Remove it immediately;
 # never rename it as a checkpoint, copy it, or retain it for rollback.
 shutil.rmtree(candidate)


def main(root, base, target):
 root=Path(root).resolve(strict=True)
 if git(root,'rev-parse','HEAD')!=base or git(root,'symbolic-ref','--short','HEAD')!='main':
  raise ValueError('Unexpected production branch/revision')
 if git(root,'status','--porcelain','--untracked-files=no'): raise ValueError('Tracked changes must be preserved')
 if git(root,'rev-parse','origin/main')!=target: raise ValueError('Remote main does not match reviewed target')
 subprocess.run(['git','-C',str(root),'merge-base','--is-ancestor',base,target],check=True)
 changed=set(git(root,'diff','--name-only',base,target).splitlines())
 if not changed or not changed<=SEO_FILES: raise ValueError('Release includes files outside SEO/procedure scope')
 # The repository's release bot bumps these manifests; no dependency/script
 # changes are permitted in this frontend-only path.
 for manifest in ('package.json','packages/api/package.json'):
  before=json.loads(git(root,'show',base+':'+manifest));after=json.loads(git(root,'show',target+':'+manifest))
  before.pop('version',None);after.pop('version',None)
  if before!=after: raise ValueError('Non-version manifest change: '+manifest)
 subprocess.run(['python3',str(root/'deploy/release_guard.py'),'inventory',str(root)],check=True,stdout=subprocess.DEVNULL)
 if shutil.disk_usage(root).free<600*1024*1024: raise ValueError('Less than 600 MiB free; no release changes made')
 live=root/'packages/web/dist'
 if live.is_symlink(): raise ValueError('Unexpected live static symlink')
 previous=snapshot(live)
 live_inode=live.stat().st_ino
 data=root/'packages/api/data'
 locks=[]; stage=None; updated=False; switched=False
 try:
  for name in ('.deployment.lock','.release.lock'):
   p=data/name
   fd=os.open(p,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
   lock=os.fdopen(fd,'r+');locks.append(lock);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  # Recheck after taking both locks; no service is paused or restarted.
  if git(root,'rev-parse','HEAD')!=base or git(root,'status','--porcelain','--untracked-files=no'):
   raise ValueError('Production checkout changed during preflight')
  stage=Path(tempfile.mkdtemp(prefix='.release-stage.seo-',dir=root))
  # Release capability probe touches only two empty artifact directories.
  a,b=stage/'probe-a',stage/'probe-b';a.mkdir();b.mkdir();exchange(a,b);a.rmdir();b.rmdir()
  subprocess.run(['git','-C',str(root),'merge','--ff-only',target],check=True);updated=True
  candidate=stage/'web-dist'
  env={**os.environ,'API_URL':'http://127.0.0.1:4100','PUBLIC_SITE_URL':'https://norvyn.com','ASTRO_TELEMETRY_DISABLED':'1'}
  subprocess.run(['pnpm','--filter','web','build','--outDir',str(candidate)],cwd=root,env=env,check=True)
  result=validate(candidate,previous)
  subprocess.run(['chown','-R','caddy:caddy',str(candidate)],check=True)
  # Apply the existing public-content label to generated output; no SELinux policy change.
  subprocess.run(['chcon','-R','--reference='+str(live/'index.html'),str(candidate)],check=True)
  promote(candidate,live);switched=True
  print(json.dumps({'deployed':target,**result,'apiRestarted':False,'sharedServicesTouched':False,'checkpointCreated':False}))
 except BaseException:
  # Atomic exchange failure leaves live output unchanged. Restore source from Git,
  # never from a source copy. After promotion, do not silently undo a live release.
  switched = live.stat().st_ino != live_inode
  if updated and not switched:
   if snapshot(live)==previous:
    subprocess.run(['git','-C',str(root),'restore','--source='+base,'--staged','--worktree','--',*sorted(changed)],check=True)
    subprocess.run(['git','-C',str(root),'reset','--soft',base],check=True)
   else: print('Static promotion may have completed; inspect health before any recovery.',file=sys.stderr)
  raise
 finally:
  if stage and stage.exists(): shutil.rmtree(stage)
  for lock in reversed(locks):lock.close()


if __name__=='__main__':
 if len(sys.argv)!=4: raise SystemExit('usage: seo-release.py ROOT BASE_COMMIT TARGET_COMMIT')
 def interrupted(*_): raise SystemExit('SEO release interrupted')
 signal.signal(signal.SIGTERM, interrupted)
 main(*sys.argv[1:])
