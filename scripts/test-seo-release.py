#!/usr/bin/env python3
"""Local-only static promotion and validation failure rehearsals."""
import importlib.util
from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch
import subprocess

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('seo',ROOT/'deploy/seo-release.py')
seo=importlib.util.module_from_spec(spec);spec.loader.exec_module(seo)


def fixture(root, description='Old description', body='Keep published content', guid='https://norvyn.com/posts/one'):
 root.mkdir(parents=True,exist_ok=True)
 raw=f'<html><head><meta name="description" content="{description}"><link rel="canonical" href="https://norvyn.com/"><meta property="og:url" content="https://norvyn.com/"></head><body><p>{body}</p><a href="/apps">Apps</a></body></html>'
 (root/'index.html').write_text(raw)
 (root/'rss.xml').write_text(f'<rss><channel><item><guid isPermaLink="true">{guid}</guid></item></channel></rss>')
 (root/'sitemap.xml').write_text('<urlset><url><loc>https://norvyn.com/</loc></url></urlset>')


class Release(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='wordbase-seo-test-')
  self.root=Path(self.temp.name);self.live=self.root/'dist';self.candidate=self.root/'stage/web-dist'
  fixture(self.live);fixture(self.candidate,description='Corrected SEO description')
 def tearDown(self):self.temp.cleanup()
 def swap(self,a,b):
  # Local portable double for the single Linux atomic syscall, not used on host.
  temporary=self.root/'swap-only-in-local-test';os.rename(a,temporary);os.rename(b,a);os.rename(temporary,b)
 def test_failed_build_keeps_live_data_and_removes_only_candidate_artifacts(self):
  root=self.root/'project';live=root/'packages/web/dist';fixture(live)
  data=root/'packages/api/data';data.mkdir(parents=True);(data/'blog.db').write_text('core data')
  old=(live/'index.html').read_bytes();calls=[]
  def git(_root,*args):
   if args==('rev-parse','HEAD'):return 'base'
   if args==('symbolic-ref','--short','HEAD'):return 'main'
   if args==('rev-parse','origin/main'):return 'target'
   if args[:2]==('diff','--name-only'):return 'packages/web/src/lib/blog-feed.ts'
   if args[0]=='status':return ''
   if args[0]=='show':return '{"version":"1.11.1","scripts":{}}'
   raise AssertionError(args)
  def run(args,**kwargs):
   calls.append(args)
   if args[0]=='pnpm':
    output=Path(args[-1]);output.mkdir();(output/'index.html').write_text('partial')
    raise subprocess.CalledProcessError(1,args)
   return subprocess.CompletedProcess(args,0)
  with patch.object(seo,'git',git),patch.object(seo.subprocess,'run',run),patch.object(seo,'exchange',self.swap):
   with self.assertRaises(subprocess.CalledProcessError):seo.main(root,'base','target')
  self.assertEqual((live/'index.html').read_bytes(),old)
  self.assertEqual((data/'blog.db').read_text(),'core data')
  self.assertFalse(list(root.glob('.release-stage.*')))
  self.assertTrue(any('restore' in c for c in calls))
  self.assertFalse(any('systemctl' in c for c in calls))

 def test_metadata_only_release_preserves_published_body_and_ids(self):
  result=seo.validate(self.candidate,seo.snapshot(self.live));self.assertEqual(result['feedItems'],1)
  seo.promote(self.candidate,self.live,self.swap)
  self.assertIn('Corrected SEO',(self.live/'index.html').read_text())
  self.assertFalse(self.candidate.exists());self.assertFalse(list(self.root.rglob('*previous*')))
 def test_failed_exchange_keeps_live_unchanged(self):
  before=(self.live/'index.html').read_bytes()
  def fail(*_):raise OSError('injected unsupported exchange')
  with self.assertRaises(OSError):seo.promote(self.candidate,self.live,fail)
  self.assertEqual((self.live/'index.html').read_bytes(),before)
 def test_incomplete_build_cannot_replace_live(self):
  (self.candidate/'index.html').unlink()
  with self.assertRaises(ValueError):seo.promote(self.candidate,self.live,self.swap)
  self.assertTrue((self.live/'index.html').is_file())
 def test_body_change_blocks_promotion(self):
  fixture(self.candidate,body='Unexpected UI/content change')
  with self.assertRaisesRegex(ValueError,'Public body'):seo.validate(self.candidate,seo.snapshot(self.live))
 def test_link_change_blocks_promotion(self):
  p=self.candidate/'index.html';p.write_text(p.read_text().replace('href="/apps"','href="/lost"'))
  with self.assertRaisesRegex(ValueError,'Public body'):seo.validate(self.candidate,seo.snapshot(self.live))
 def test_changed_feed_id_blocks_promotion(self):
  fixture(self.candidate,guid='https://julian.cafe/posts/one')
  with self.assertRaisesRegex(ValueError,'feed IDs'):seo.validate(self.candidate,seo.snapshot(self.live))
 def test_wrong_canonical_blocks_promotion(self):
  p=self.candidate/'index.html';p.write_text(p.read_text().replace('https://norvyn.com/','https://julian.cafe/'))
  with self.assertRaisesRegex(ValueError,'origin'):seo.validate(self.candidate,seo.snapshot(self.live))
 def test_output_symlink_cannot_delete_core_data(self):
  core=self.root/'core';core.mkdir();(core/'data').write_text('preserve')
  link=self.root/'linked-dist';link.symlink_to(core,target_is_directory=True)
  with self.assertRaises(ValueError):seo.promote(self.candidate,link,self.swap)
  self.assertEqual((core/'data').read_text(),'preserve')
 def test_new_output_cleanup_does_not_follow_upload_symlinks(self):
  uploads=self.root/'uploads';uploads.mkdir();(uploads/'data').write_text('preserve')
  (self.live/'uploads').symlink_to(uploads,target_is_directory=True)
  seo.promote(self.candidate,self.live,self.swap)
  self.assertEqual((uploads/'data').read_text(),'preserve')

if __name__=='__main__':unittest.main(verbosity=2)
