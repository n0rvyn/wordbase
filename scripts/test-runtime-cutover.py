#!/usr/bin/env python3
"""Disposable filesystem transactions; no host services or runtime changes."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cutover', ROOT/'deploy/runtime-cutover.py')
cutover = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cutover)


class RuntimeRecovery(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='wordbase-node-runtime-')
        self.base = Path(self.temp.name)
        self.root, self.stage, self.backup, self.systemd = [self.base/name for name in ['live','candidate','backup','systemd']]
        for directory, marker in [(self.root,'native-abi108'),(self.stage,'native-abi137')]:
            for name in cutover.MODULES:
                path=directory/name;path.mkdir(parents=True);(path/'binding-marker').write_text(marker)
        self.db=self.root/'packages/api/data/blog.db';self.db.parent.mkdir();self.db.write_bytes(b'live DB, never restore a stale snapshot')
        self.upload=self.db.parent/'uploads/photo.jpg';self.upload.parent.mkdir();self.upload.write_bytes(b'post-snapshot upload')
        self.other=self.systemd/'other-project.service.d/runtime.conf';self.other.parent.mkdir(parents=True);self.other.write_text('ExecStart=/usr/bin/node other-app.js')
        self.revision='afc11179edae3395b69978e63a505621767764b3'
        self.actions=[];self.fail_health=False;self.fail_quiesce=False
        def service(action,unit):
            self.actions.append((action,unit))
            if action=='active':return True
            if action=='executable':return '/usr/bin/node'
            if action=='quiesce' and self.fail_quiesce:raise RuntimeError('running build did not finish')
            if action=='healthy' and self.fail_health and unit==cutover.NODE:return False
            return True
        self.transaction=cutover.Transaction(self.root,self.stage,self.backup,self.systemd,service,lambda:self.revision)

    def tearDown(self):self.temp.cleanup()

    def assert_preserved(self,marker):
        for name in cutover.MODULES:self.assertEqual((self.root/name/'binding-marker').read_text(),marker)
        self.assertEqual(self.db.read_bytes(),b'live DB, never restore a stale snapshot')
        self.assertEqual(self.upload.read_bytes(),b'post-snapshot upload')
        self.assertEqual(self.other.read_text(),'ExecStart=/usr/bin/node other-app.js')
        self.assertFalse(any(unit=='caddy' for action,unit in self.actions))

    def test_cutover_and_explicit_runtime_rollback_pair_native_trees(self):
        self.transaction.install('node24-api','node24-rebuild')
        self.assert_preserved('native-abi137')
        self.transaction.restore()
        self.assert_preserved('native-abi108')
        self.assertTrue(all(not (self.systemd/name).exists() for name in cutover.DROPINS))

    def test_failed_candidate_health_recovers_previous_runtime(self):
        self.fail_health=True
        with self.assertRaisesRegex(RuntimeError,'Node 24'):self.transaction.install('node24-api','node24-rebuild')
        self.assert_preserved('native-abi108')
        self.assertIn(('healthy','/usr/bin/node'),self.actions)

    def test_failure_halfway_through_dependency_switch_recovers_all_directories(self):
        move=cutover.shutil.move
        def fail_once(source,target):
            if source==str(self.stage/cutover.MODULES[1]):raise OSError('injected move failure')
            return move(source,target)
        with patch.object(cutover.shutil,'move',fail_once):
            with self.assertRaisesRegex(OSError,'injected'):self.transaction.install('node24-api','node24-rebuild')
        self.assert_preserved('native-abi108')

    def test_prior_dropin_bytes_are_restored(self):
        target=self.systemd/cutover.DROPINS[0];target.parent.mkdir(parents=True);target.write_text('existing owner runtime override')
        self.transaction.install('node24-api','node24-rebuild');self.transaction.restore()
        self.assertEqual(target.read_text(),'existing owner runtime override')

    def test_runtime_downgrade_after_source_release_is_refused_before_service_actions(self):
        self.transaction.install('node24-api','node24-rebuild');self.revision='new-reviewed-api-revision';self.actions.clear()
        with self.assertRaisesRegex(ValueError,'Source revision changed'):self.transaction.restore()
        self.assertEqual(self.actions,[])
        self.assert_preserved('native-abi137')

    def test_wait_failure_does_not_stop_the_healthy_api(self):
        self.fail_quiesce=True
        with self.assertRaisesRegex(RuntimeError,'running build'):self.transaction.install('node24-api','node24-rebuild')
        self.assertNotIn(('stop','wordbase-api'),self.actions)
        self.assert_preserved('native-abi108')


if __name__=='__main__':unittest.main(verbosity=2)
