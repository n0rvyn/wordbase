#!/usr/bin/env python3
"""Local-only rehearsals: exact production Git tree, synthetic runtime data.

No commits, pushes, network calls, real services or production data are used.
Linux service commands are doubles; flock uses the real host kernel locks.
"""
import fcntl
import importlib.util
import json
import os
import re
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
PRODUCTION = 'afc11179edae3395b69978e63a505621767764b3'
BASE = 'd5779441b54ea567c450c090d22ec2035be34b7b'
GIT = shutil.which('git')
spec = importlib.util.spec_from_file_location('release_guard', ROOT/'deploy/release_guard.py')
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

MOCK = r'''#!PYTHON
import fcntl,json,os,signal,subprocess,sys,time
from pathlib import Path
name=Path(sys.argv[0]).name
args=sys.argv[1:]
root=Path(os.environ['WORDBASE_RELEASE_ROOT'])
statefile=Path(os.environ['STATE'])
state=json.loads(statefile.read_text())
with Path(os.environ['CALLS']).open('a') as log: log.write(json.dumps([name,*args])+'\n')
if name=='sudo': os.execvp(args[0],args)
if name=='git':
 if args[:1]==['pull']: args=['checkout','-q','-B','main',os.environ['BASE']]
 os.execv(os.environ['REAL_GIT'],['git',*args])
if name=='systemctl':
 action=args[0]; unit=args[-1]
 if action=='is-active':
  active=state.get(unit,False)
  if '--quiet' not in args: print('active' if active else 'inactive')
  sys.exit(0 if active else 3)
 if action=='show': print('inactive');sys.exit(0)
 if action in ('stop','start','restart'):
  state[unit]=action!='stop';statefile.write_text(json.dumps(state))
 sys.exit(0)
if name=='flock':
 fd=int(args[-1]); blocking='-n' not in args
 try: fcntl.flock(fd,fcntl.LOCK_EX|(0 if blocking else fcntl.LOCK_NB))
 except BlockingIOError: sys.exit(1)
 sys.exit(0)
if name=='node':
 if args==['--version']:print(os.environ.get('MOCK_NODE_VERSION','v25.9.0'));sys.exit(0)
 (root/'node.pid').write_text(str(os.getpid()))
 signal.signal(signal.SIGTERM,lambda *_:sys.exit(0))
 while True:time.sleep(.01)
if name=='curl':
 if os.environ.get('FAIL_HEALTH'):sys.exit(1)
 if state.get('wordbase-api',False) and os.environ.get('FINAL_HEALTH_FAILURES'):
  state['managedHealthChecks']=state.get('managedHealthChecks',0)+1
  statefile.write_text(json.dumps(state))
  if state['managedHealthChecks']<=int(os.environ['FINAL_HEALTH_FAILURES']):sys.exit(1)
 sys.exit(0)
if name=='sleep':time.sleep(.01);sys.exit(0)
if name=='pnpm':
 if args[0]=='build' and Path.cwd().name=='api':
  (root/'packages/api/dist/index.js').write_text('reviewed-import-api');sys.exit(0)
 if args[0]=='db:migrate':
  import sqlite3
  with sqlite3.connect(root/'packages/api/data/blog.db') as db:db.executescript(Path(os.environ['MIGRATION_SQL']).read_text())
 if args[0]=='build' and Path.cwd().name=='web':
  assert '--outDir' in args, 'must build outside served dist'
  output=Path(args[args.index('--outDir')+1]);output.mkdir(parents=True)
  (output/'index.html').write_text('new-static')
  (root/'build-entered').write_text('yes')
  if os.environ.get('QUEUE_REQUEST'): (root/'packages/api/data/.rebuild-request').write_text('new request')
  time.sleep(float(os.environ.get('BUILD_DELAY','0')))
  if os.environ.get('FAIL_WEB'):print('injected frontend build failure');sys.exit(19)
 sys.exit(0)
if name=='mv':
 if os.environ.get('FAIL_SWAP') and args[0].endswith('/web-dist') and not (root/'swap-failed').exists():
  (root/'swap-failed').write_text('yes');sys.exit(1)
 os.execv('/bin/mv',['mv',*args])
if name in ('chown','restorecon','semanage','setsebool','cp','ln','ls'):sys.exit(0)
raise SystemExit('Unexpected command '+name)
'''


class Recovery(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='wordbase-release-rehearsal-')
        self.base = Path(self.temp.name)
        self.repo = self.base/'wordbase'
        subprocess.run([GIT,'clone','--shared','--no-checkout','-q',str(ROOT),str(self.repo)],check=True)
        self.git('checkout','-q','-B','main',PRODUCTION)
        # Only generated fixture artifacts are excluded; no source exceptions.
        with (self.repo/'.git/info/exclude').open('a') as output:
            output.write('\n.release-stage.*/\n.rollback-stage.*/\n.rebuild-stage.*/\nnode.pid\nbuild-entered\nswap-failed\n')
        self.data=self.repo/'packages/api/data'
        self.data.mkdir(parents=True,exist_ok=True)
        for name in ['.cache/pnpm/example','.local/share/pnpm/example','blog.db.bak-pageviews-20260604-125139','build-status.json']:
            path=self.data/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('preserve me')
        self.runtime=guard.inventory(self.repo)
        production_source=self.git('show',PRODUCTION+':packages/api/src/db/index.ts').decode()
        production_sql=re.search(r'sqlite\.exec\(`(.*?)`\);',production_source,re.S).group(1)
        self.migration=self.base/'migration.sql'
        self.migration.write_text(re.search(r'sqlite\.exec\(`(.*?)`\);',(ROOT/'packages/api/src/db/index.ts').read_text(),re.S).group(1))
        with sqlite3.connect(self.data/'blog.db') as db:
            db.executescript(production_sql)
            db.execute('create table content (value text)');db.execute("insert into content values ('current data')")
            db.execute("insert into posts (id,slug,title,content,status,created_at,updated_at) values ('post-1','original','Original','Keep authored content','published',1,1)")
        for name,value in [('packages/web/dist/index.html','old-static'),('packages/api/dist/index.js','old-api'),('packages/api/data/uploads/test.txt','original upload'),('.env','PUBLIC_SITE_URL=https://norvyn.com\n')]:
            path=self.repo/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(value)
        self.state=self.base/'state.json';self.state.write_text(json.dumps({'wordbase-api':True,'wordbase-rebuild.path':True,'caddy':True}))
        self.calls=self.base/'calls.jsonl';self.calls.touch()
        bindir=self.base/'bin';bindir.mkdir()
        for name in ['git','sudo','systemctl','flock','node','curl','sleep','pnpm','mv','chown','restorecon','semanage','setsebool','cp','ln','ls']:
            path=bindir/name;path.write_text(MOCK.replace('#!PYTHON','#!'+sys.executable));path.chmod(0o755)
        self.env={**os.environ,'PATH':str(bindir)+os.pathsep+os.environ['PATH'],'WORDBASE_RELEASE_ROOT':str(self.repo),'REAL_GIT':GIT,'BASE':BASE,'STATE':str(self.state),'CALLS':str(self.calls),'MIGRATION_SQL':str(self.migration)}

    def tearDown(self):
        self.temp.cleanup()

    def git(self,*args):
        return subprocess.check_output([GIT,'-C',str(self.repo),*args],stderr=subprocess.PIPE)

    def run_script(self,name,*args,**extra):
        return subprocess.run(['bash',str(ROOT/'deploy'/name),*map(str,args)],env={**self.env,**extra},capture_output=True,text=True,timeout=20)

    def services(self):
        return json.loads(self.state.read_text())

    def assert_recovered(self):
        self.assertTrue(self.services()['wordbase-api'])
        self.assertTrue(self.services()['wordbase-rebuild.path'])
        self.assertEqual((self.repo/'packages/web/dist/index.html').read_text(),'old-static')
        self.assertEqual([x for x in guard.inventory(self.repo) if not x['path'].endswith('.lock')],self.runtime)
        pid=self.repo/'node.pid'
        if pid.exists():
            with self.assertRaises(ProcessLookupError):os.kill(int(pid.read_text()),0)

    def test_snapshot_preserves_runtime_and_database(self):
        snapshot=self.base/'snapshot';result=self.run_script('snapshot-release.sh',snapshot)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((snapshot/'revision.txt').read_text().strip(),PRODUCTION)
        self.assertEqual(json.loads((snapshot/'runtime-inventory.json').read_text()),self.runtime)
        with tarfile.open(snapshot/'runtime-entries.tgz') as archive:
            self.assertIn('packages/api/data/blog.db.bak-pageviews-20260604-125139',archive.getnames())
        with sqlite3.connect(snapshot/'blog.db') as db:self.assertEqual(db.execute('pragma integrity_check').fetchone()[0],'ok')
        self.assertEqual([row for row in guard.inventory(self.repo) if not row['path'].endswith('.lock')],self.runtime)

    def test_runtime_cache_symlinks_are_preserved_without_following_targets(self):
        outside=self.base/'outside-cache';outside.write_text('not part of the checkout')
        link=self.data/'.local/share/pnpm/link';link.symlink_to(outside)
        snapshot=self.base/'snapshot';result=self.run_script('snapshot-release.sh',snapshot)
        self.assertEqual(result.returncode,0,result.stderr)
        with tarfile.open(snapshot/'runtime-entries.tgz') as archive:
            member=archive.getmember('packages/api/data/.local/share/pnpm/link')
            self.assertTrue(member.issym());self.assertEqual(member.linkname,str(outside))
        self.assertEqual(outside.read_text(),'not part of the checkout')

    def test_unaccounted_and_tracked_changes_rejected(self):
        extra=self.repo/'user-notes.txt';extra.write_text('user work')
        result=self.run_script('setup.sh');self.assertNotEqual(result.returncode,0)
        self.assertIn('Unaccounted',result.stderr);self.assertEqual(extra.read_text(),'user work')
        extra.unlink()
        path=self.repo/'README.md';path.write_text(path.read_text()+'\nuser edit\n')
        self.assertNotEqual(self.run_script('setup.sh').returncode,0)
        self.assertNotIn('wordbase-api',self.calls.read_text())

    def test_failed_frontend_build_recovers_api_and_watcher(self):
        result=self.run_script('setup.sh',FAIL_WEB='1')
        self.assertNotEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('injected frontend build failure',result.stdout)
        self.assert_recovered()
        self.assertEqual((self.repo/'packages/api/dist/index.js').read_text(),'reviewed-import-api')
        with sqlite3.connect(self.data/'blog.db') as db:
            self.assertIn('reviewed_at',[row[1] for row in db.execute('pragma table_info(app_imports)')])
            self.assertEqual(db.execute('select content from posts').fetchone()[0],'Keep authored content')

    def test_unhealthy_temporary_api_aborts_before_frontend(self):
        result=self.run_script('setup.sh',FAIL_HEALTH='1')
        self.assertNotEqual(result.returncode,0)
        self.assertFalse((self.repo/'build-entered').exists())
        self.assert_recovered()

    def test_failed_swap_restores_served_static(self):
        result=self.run_script('setup.sh',FAIL_SWAP='1')
        self.assertNotEqual(result.returncode,0)
        self.assert_recovered()

    def test_version_only_rollback_keeps_new_api_database_uploads(self):
        snapshot=self.base/'snapshot';result=self.run_script('snapshot-release.sh',snapshot)
        self.assertEqual(result.returncode,0,result.stderr)
        self.git('checkout','-q','-B','main',BASE)
        self.assertEqual(guard.dependencies(self.repo,PRODUCTION)['versionOnlyDifferences'],['package.json','packages/api/package.json'])
        (self.repo/'packages/web/dist/index.html').write_text('new-static')
        (self.repo/'packages/api/dist/index.js').write_text('reviewed-import-api')
        (self.data/'uploads/test.txt').write_text('post-snapshot upload')
        with sqlite3.connect(self.data/'blog.db') as db:db.execute("insert into content values ('post-snapshot data')")
        result=self.run_script('restore-release.sh',snapshot)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((self.repo/'packages/web/dist/index.html').read_text(),'old-static')
        self.assertEqual((self.repo/'packages/api/dist/index.js').read_text(),'reviewed-import-api')
        self.assertEqual((self.data/'uploads/test.txt').read_text(),'post-snapshot upload')
        with sqlite3.connect(self.data/'blog.db') as db:self.assertEqual(db.execute('select count(*) from content').fetchone()[0],2)
        self.assertTrue(self.services()['wordbase-rebuild.path'])

    def test_catalog_aware_frontend_rollback_builds_before_promotion(self):
        snapshot=self.base/'snapshot';self.assertEqual(self.run_script('snapshot-release.sh',snapshot).returncode,0)
        self.git('checkout','-q','-B','main',BASE)
        (self.repo/'packages/web/dist/index.html').write_text('current-serving-output')
        result=self.run_script('restore-release.sh',snapshot,'--rebuild-current-catalog')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((self.repo/'packages/web/dist/index.html').read_text(),'new-static')
        self.assertTrue(self.services()['wordbase-api'])

    def test_failed_catalog_rollback_build_keeps_served_output_and_release_source(self):
        snapshot=self.base/'snapshot';self.assertEqual(self.run_script('snapshot-release.sh',snapshot).returncode,0)
        self.git('checkout','-q','-B','main',BASE)
        (self.repo/'packages/web/dist/index.html').write_text('current-serving-output')
        result=self.run_script('restore-release.sh',snapshot,'--rebuild-current-catalog',FAIL_WEB='1')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual((self.repo/'packages/web/dist/index.html').read_text(),'current-serving-output')
        self.assertEqual(self.git('diff','--name-only','HEAD','--','packages/web').decode().strip(),'')
        self.assertTrue(self.services()['wordbase-rebuild.path'])

    def test_real_dependency_change_rejected(self):
        path=self.repo/'packages/web/package.json';data=json.loads(path.read_text());data['scripts']['build']='unsafe change';path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'Dependency inputs changed'):guard.dependencies(self.repo,PRODUCTION)
        path=self.repo/'pnpm-lock.yaml';path.write_text(path.read_text()+'\n# changed\n')
        self.git('restore','packages/web/package.json')
        with self.assertRaisesRegex(ValueError,'Dependency inputs changed'):guard.dependencies(self.repo,PRODUCTION)

    def test_corrupt_snapshot_refused_without_service_changes(self):
        snapshot=self.base/'snapshot';self.assertEqual(self.run_script('snapshot-release.sh',snapshot).returncode,0)
        (snapshot/'static-and-uploads.tgz').write_bytes(b'corrupt')
        self.calls.write_text('')
        self.assertNotEqual(self.run_script('restore-release.sh',snapshot).returncode,0)
        self.assertNotIn('systemctl',self.calls.read_text())

    def test_failed_content_rebuild_keeps_static_and_new_request(self):
        result=self.run_script('rebuild.sh',FAIL_WEB='1',QUEUE_REQUEST='1')
        self.assertNotEqual(result.returncode,0)
        self.assertEqual((self.repo/'packages/web/dist/index.html').read_text(),'old-static')
        self.assertEqual(json.loads((self.data/'build-status.json').read_text())['status'],'failed')
        self.assertTrue((self.data/'.rebuild-request').exists())

    def test_actual_production_node18_refused_before_mutation(self):
        result=self.run_script('setup.sh',MOCK_NODE_VERSION='v18.20.8')
        self.assertNotEqual(result.returncode,0)
        self.assertIn('Unsupported runtime v18.20.8',result.stderr)
        self.assertEqual(self.git('rev-parse','HEAD').decode().strip(),PRODUCTION)
        self.assertNotIn('systemctl',self.calls.read_text())
        self.assertFalse((self.data/'.deployment.lock').exists())

    def test_unchanged_caddy_config_does_not_restart_shared_caddy(self):
        existing=self.base/'caddy-wordbase';existing.write_bytes((self.repo/'deploy/wordbase').read_bytes())
        result=self.run_script('setup.sh',WORDBASE_CADDY_SITE=str(existing))
        self.assertEqual(result.returncode,0,result.stderr)
        calls=[json.loads(row) for row in self.calls.read_text().splitlines()]
        self.assertNotIn(['systemctl','restart','caddy'],calls)
        self.assertTrue(self.services()['caddy'])

    def test_managed_api_readiness_retries_slow_startup(self):
        result=self.run_script('setup.sh',FINAL_HEALTH_FAILURES='3')
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertGreaterEqual(json.loads(self.state.read_text())['managedHealthChecks'],4)
        self.assertEqual((self.repo/'packages/web/dist/index.html').read_text(),'new-static')

    def test_successful_release_installs_only_completed_static(self):
        result=self.run_script('setup.sh')
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual((self.repo/'packages/web/dist/index.html').read_text(),'new-static')
        self.assertTrue(self.services()['wordbase-api'])
        self.assertTrue(self.services()['wordbase-rebuild.path'])

    def test_deployment_lock_contention_is_fail_closed(self):
        with (self.data/'.deployment.lock').open('w') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            result=self.run_script('setup.sh')
        self.assertNotEqual(result.returncode,0)
        self.assertNotIn('"stop"',self.calls.read_text())
        self.assertEqual((self.repo/'packages/web/dist/index.html').read_text(),'old-static')

    def test_rebuild_waits_on_shared_lock_without_consuming_request(self):
        (self.data/'.rebuild-request').write_text('queued')
        with (self.data/'.release.lock').open('w') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            process=subprocess.Popen(['bash',str(ROOT/'deploy/rebuild.sh')],env=self.env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            time.sleep(.25)
            self.assertIsNone(process.poll())
            self.assertTrue((self.data/'.rebuild-request').exists())
            self.assertFalse((self.repo/'build-entered').exists())
        output,error=process.communicate(timeout=10)
        self.assertEqual(process.returncode,0,error)
        self.assertEqual((self.repo/'packages/web/dist/index.html').read_text(),'new-static')


if __name__ == '__main__':unittest.main(verbosity=2)
