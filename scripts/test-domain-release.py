#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('domain',ROOT/'deploy/domain-release.py')
domain=importlib.util.module_from_spec(spec);spec.loader.exec_module(domain)

class DomainRelease(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  self.api=self.root/'api';self.web=self.root/'web';self.next_api=self.root/'next-api';self.next_web=self.root/'next-web'
  for p,text in ((self.api,'old api'),(self.web,'old web'),(self.next_api,'new api'),(self.next_web,'new web')):
   p.mkdir();(p/'output').write_text(text)
  self.env=self.root/'.env';self.original='SITE_URL=https://norvyn.com\nPUBLIC_SITE_URL=https://norvyn.com\nKEEP=unchanged\n';self.env.write_text(self.original)
  self.core=self.root/'core.db';self.core.write_text('core data untouched')
  self.calls=[]
 def tearDown(self):self.temp.cleanup()
 def swap(self,a,b):
  tmp=self.root/'swap';a.rename(tmp);b.rename(a);tmp.rename(b)
 def activate(self,swap=None,restart=None,health=None):
  domain.activate(self.next_api,self.api,self.next_web,self.web,self.env,'https://julian.cafe',swap or self.swap,restart or (lambda:self.calls.append('restart wordbase-api')),health or (lambda:None))
 def check_old(self):
  self.assertEqual((self.api/'output').read_text(),'old api');self.assertEqual((self.web/'output').read_text(),'old web')
  self.assertEqual(self.env.read_text(),self.original);self.assertEqual(self.core.read_text(),'core data untouched')
 def test_success_updates_both_artifacts_and_only_public_environment(self):
  self.activate();self.assertEqual((self.api/'output').read_text(),'new api');self.assertEqual((self.web/'output').read_text(),'new web')
  self.assertIn('PUBLIC_SITE_URL=https://julian.cafe',self.env.read_text());self.assertIn('SITE_URL=https://norvyn.com',self.env.read_text())
  self.assertIn('KEEP=unchanged',self.env.read_text());self.assertEqual(self.calls,['restart wordbase-api'])
 def test_failed_api_health_restores_outputs_and_environment(self):
  def fail():raise RuntimeError('health failed')
  with self.assertRaises(RuntimeError):self.activate(health=fail)
  self.check_old();self.assertEqual(len(self.calls),2)
 def test_failed_web_exchange_restores_api_and_environment(self):
  def fail(a,b):
   if b==self.web:raise OSError('web exchange failed')
   self.swap(a,b)
  with self.assertRaises(OSError):self.activate(swap=fail)
  self.check_old()
 def test_failed_first_exchange_keeps_live_and_environment(self):
  def fail(a,b):raise OSError('atomic exchange unavailable')
  with self.assertRaises(OSError):self.activate(swap=fail)
  self.check_old();self.assertEqual(self.calls,[])
 def test_api_restart_failure_restores_old_generated_code(self):
  def restart():
   self.calls.append('restart wordbase-api')
   if len(self.calls)==1:raise RuntimeError('new API failed')
  with self.assertRaises(RuntimeError):self.activate(restart=restart)
  self.check_old();self.assertEqual(len(self.calls),2)
 def test_detects_an_exchange_completed_before_interruption(self):
  interrupted_once=False
  def interrupted(a,b):
   nonlocal interrupted_once
   self.swap(a,b)
   if b==self.web and not interrupted_once:
    interrupted_once=True;raise SystemExit('signal after atomic exchange')
  with self.assertRaises(SystemExit):self.activate(swap=interrupted)
  self.check_old()
 def test_rejects_symlink_before_environment_or_output_changes(self):
  link=self.root/'env-link';link.symlink_to(self.env)
  with self.assertRaises(ValueError):domain.activate(self.next_api,self.api,self.next_web,self.web,link,'https://julian.cafe',self.swap)
  self.check_old()
 def test_public_setting_handles_missing_newline_without_touching_runtime(self):
  self.assertEqual(domain.public_environment('SITE_URL=https://norvyn.com','https://julian.cafe'),'SITE_URL=https://norvyn.com\nPUBLIC_SITE_URL=https://julian.cafe\n')
  with self.assertRaises(ValueError):domain.public_environment('PUBLIC_SITE_URL=a\nPUBLIC_SITE_URL=b\n','https://julian.cafe')
 def test_scope_excludes_shared_infrastructure_and_core_data(self):
  self.assertNotIn('deploy/wordbase',domain.ALLOWED)
  self.assertNotIn('deploy/wordbase-api.service',domain.ALLOWED)
  self.assertNotIn('.env',domain.ALLOWED)
  self.assertNotIn('packages/api/data/blog.db',domain.ALLOWED)

class MigrationValidation(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  self.old=self.root/'old';self.new=self.root/'new';self.release=domain.common(ROOT)
  for path,origin in ((self.old,'https://norvyn.com'),(self.new,'https://julian.cafe')):
   path.mkdir()
   (path/'index.html').write_text(f'<html><head><link rel="canonical" href="{origin}/"><meta property="og:url" content="{origin}/"><meta name="description" content="Keep description"></head><body><p>Keep exact content</p><a href="{origin}/api/podcasts/show/feed.xml?q=1">Feed</a><a href="https://external.example/">External</a></body></html>')
   (path/'rss.xml').write_text('<rss><channel><item><guid isPermaLink="true">https://norvyn.com/posts/one</guid></item></channel></rss>')
   (path/'sitemap.xml').write_text(f'<urlset><url><loc>{origin}/</loc></url></urlset>')
  self.previous=domain.migration_snapshot(self.release,self.old)
 def tearDown(self):self.temp.cleanup()
 def validate(self):return domain.validate_migration(self.release,self.new,self.previous,'https://julian.cafe')
 def test_changes_only_the_domain_and_keeps_ids(self):
  self.assertEqual(self.validate()['feedItems'],1)
 def test_rejects_body_or_external_destination_changes(self):
  p=self.new/'index.html';raw=p.read_text()
  for old,new in (('Keep exact content','Changed legal content'),('external.example','different.example'),('q=1','q=2')):
   p.write_text(raw.replace(old,new))
   with self.assertRaisesRegex(ValueError,'Public content'):self.validate()
  p.write_text(raw)
 def test_rejects_feed_id_changes(self):
  p=self.new/'rss.xml';p.write_text(p.read_text().replace('https://norvyn.com/posts/one','https://julian.cafe/posts/one'))
  with self.assertRaisesRegex(ValueError,'feed IDs'):self.validate()
 def test_rejects_wrong_canonical(self):
  p=self.new/'index.html';p.write_text(p.read_text().replace('julian.cafe','wrong.example'))
  with self.assertRaises(ValueError):self.validate()
 def test_share_destination_moves_but_endpoint_and_message_stay_protected(self):
  a='https://twitter.com/intent/tweet?text=Same&url=https%3A%2F%2Fnorvyn.com%2Fposts%2Fone'
  b=a.replace('norvyn.com','julian.cafe')
  self.assertEqual(domain.normalize_link(a),domain.normalize_link(b))
  self.assertNotEqual(domain.normalize_link(a),domain.normalize_link(b.replace('Same','Changed')))
  self.assertNotEqual(domain.normalize_link(a),domain.normalize_link(b.replace('twitter.com','attacker.example')))

if __name__=='__main__':unittest.main(verbosity=2)
