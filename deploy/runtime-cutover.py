#!/usr/bin/env python3
"""Wordbase-only dependency/runtime transaction. Default command is read-only.

Runtime binaries/tooling must already exist under /opt/wordbase. Apply is a
separate authorized operation BEFORE source deployment or catalog publication.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import time

MODULES = ['node_modules', 'packages/api/node_modules', 'packages/web/node_modules']
DROPINS = ['wordbase-api.service.d/90-wordbase-runtime.conf',
           'wordbase-rebuild.service.d/90-wordbase-runtime.conf']
HERE = Path(__file__).resolve().parent
NODE = '/opt/wordbase/runtime/node-v24.22.2-linux-x64/bin/node'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def revision(root):
    return subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()


class Transaction:
    def __init__(self, root, stage, backup, systemd, service, current_revision):
        self.root, self.stage, self.backup, self.systemd = map(Path, (root, stage, backup, systemd))
        self.service, self.current_revision = service, current_revision

    def install(self, api_config, rebuild_config):
        if self.backup.exists():
            raise ValueError('Backup destination exists; nothing overwritten')
        if self.root.resolve() in self.backup.resolve().parents:
            raise ValueError('Runtime backup must be outside the checkout')
        for name in MODULES:
            if not (self.root/name).is_dir() or (self.root/name).is_symlink():
                raise ValueError('Missing/linked existing dependency directory: '+name)
            if not (self.stage/name).is_dir() or (self.stage/name).is_symlink():
                raise ValueError('Missing/linked candidate dependency directory: '+name)
        self.backup.mkdir(mode=0o700, parents=True)
        state = {'root': str(self.root.resolve()), 'revision': self.current_revision(),
                 'movedOld': [], 'movedNew': [], 'dropins': {}, 'apiWasActive': self.service('active', 'wordbase-api'),
                 'watcherWasActive': self.service('active', 'wordbase-rebuild.path'), 'previousExecutable': self.service('executable', None), 'apiStopped': False, 'complete': False}
        for name in DROPINS:
            target = self.systemd/name
            if target.is_symlink():
                raise ValueError('Unexpected runtime drop-in symlink')
            state['dropins'][name] = target.exists()
            if target.exists():
                saved = self.backup/'dropins'/name
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, saved)
        self.save(state)
        try:
            self.service('quiesce', None)
            state['apiStopped'] = True
            self.save(state)
            self.service('stop', 'wordbase-api')
            for name in MODULES:
                saved = self.backup/'previous'/name
                saved.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(self.root/name), str(saved))
                state['movedOld'].append(name)
                self.save(state)
                shutil.move(str(self.stage/name), str(self.root/name))
                state['movedNew'].append(name)
                self.save(state)
            for name, content in zip(DROPINS, [api_config, rebuild_config]):
                target = self.systemd/name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content)
                target.chmod(0o644)
            self.service('reload', None)
            self.service('start', 'wordbase-api')
            if not self.service('healthy', NODE):
                raise RuntimeError('Node 24 Wordbase API health check failed')
            state['complete'] = True
            self.save(state)
            if state['watcherWasActive']:
                self.service('start', 'wordbase-rebuild.path')
        except BaseException:
            self.restore(state)
            raise

    def save(self, state):
        path = self.backup/'state.json'
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(state, indent=2))
        temporary.replace(path)

    def restore(self, state=None):
        state = state or json.loads((self.backup/'state.json').read_text())
        if state['root'] != str(self.root.resolve()) or state['revision'] != self.current_revision():
            raise ValueError('Source revision changed: refuse runtime/native downgrade after source release')
        if state.get('restored'):
            raise ValueError('Runtime transaction already restored; no service changes')
        self.service('stop', 'wordbase-rebuild.path')
        if not state['apiStopped']:
            if state['watcherWasActive']: self.service('start', 'wordbase-rebuild.path')
            state['restored'] = True
            self.save(state)
            return
        self.service('stop', 'wordbase-api')
        for name in reversed(state['movedOld']):
            live = self.root/name
            if live.exists():
                retained = self.backup/'candidate'/name
                retained.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(live), str(retained))
            shutil.move(str(self.backup/'previous'/name), str(live))
        for name, existed in state['dropins'].items():
            target = self.systemd/name
            if existed:
                shutil.copy2(self.backup/'dropins'/name, target)
            elif target.exists():
                target.unlink()  # Only the two transaction-owned files.
        self.service('reload', None)
        if state['apiWasActive']:
            self.service('start', 'wordbase-api')
            if not self.service('healthy', state['previousExecutable']):
                raise RuntimeError('Prior runtime restored, but API health still fails; stop release')
        if state['watcherWasActive']:
            self.service('start', 'wordbase-rebuild.path')
        state['restored'] = True
        self.save(state)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=['plan', 'apply', 'rollback'])
    parser.add_argument('--root', type=Path, default=Path('/var/www/wordbase'))
    parser.add_argument('--stage', type=Path)
    parser.add_argument('--backup', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'plan':
        print(json.dumps({'root': str(args.root), 'node': NODE, 'modules': MODULES,
                          'dropins': DROPINS, 'backup': str(args.backup),
                          'affectsGlobalNode': False, 'productionChanges': False}, indent=2))
        return
    if os.geteuid() != 0:
        raise SystemExit('Authorized apply/rollback must run as root; plan is read-only')
    root = args.root.resolve(strict=True)
    if not args.backup.is_absolute() or not args.stage and args.command == 'apply':
        raise SystemExit('Provide absolute private stage and backup paths')
    subprocess.run(['python3', str(HERE/'release_guard.py'), 'inventory', str(root)], check=True, stdout=subprocess.DEVNULL)
    if args.command == 'apply':
        stage = args.stage.resolve(strict=True)
        if root == stage or root in stage.parents or stage in root.parents:
            raise SystemExit('Candidate must be outside the live checkout')
        recorded = json.loads((stage/'runtime-stage.json').read_text())
        if recorded['revision'] != revision(root) or recorded['lockSHA256'] != sha(root/'pnpm-lock.yaml'):
            raise SystemExit('Candidate revision/lockfile does not match live baseline')
        probe = subprocess.check_output([NODE, '-e',
            "const D=require(process.argv[1]);const d=new D(':memory:');d.prepare('select 1').get();d.close();console.log(JSON.stringify({node:process.version,abi:process.versions.modules,platform:process.platform,arch:process.arch}))",
            str(stage/'packages/api/node_modules/better-sqlite3')], text=True)
        if json.loads(probe) != {'node': 'v24.22.2', 'abi': '137', 'platform': 'linux', 'arch': 'x64'}:
            raise SystemExit('Candidate Node/native ABI/platform check failed')
    def interrupted(*_):
        raise SystemExit('Runtime cutover interrupted')
    signal.signal(signal.SIGTERM, interrupted)
    locks = []
    def service(action, unit):
        if action == 'active':
            return subprocess.run(['systemctl', 'is-active', '--quiet', unit]).returncode == 0
        if action == 'executable':
            pid = subprocess.check_output(['systemctl', 'show', '--value', '-p', 'MainPID', 'wordbase-api'], text=True).strip()
            return os.readlink('/proc/'+pid+'/exe')
        if action == 'reload':
            subprocess.run(['systemctl', 'daemon-reload'], check=True)
        elif action == 'healthy':
            for _ in range(30):
                try:
                    executable = service('executable', None)
                except (OSError, subprocess.CalledProcessError):
                    executable = None
                if executable == str(Path(unit).resolve()) and subprocess.run(['curl', '-fsS', 'http://127.0.0.1:4100/health'], stdout=subprocess.DEVNULL).returncode == 0:
                    return True
                time.sleep(1)
            return False
        elif action == 'quiesce':
            subprocess.run(['systemctl', 'stop', 'wordbase-rebuild.path'], check=True)
            for _ in range(300):
                state = subprocess.check_output(['systemctl', 'show', '--value', '-p', 'ActiveState', 'wordbase-rebuild.service'], text=True).strip()
                if state in ('inactive', 'failed'):
                    break
                time.sleep(1)
            else:
                raise RuntimeError('Existing content rebuild did not finish')
            lock = (root/'packages/api/data/.release.lock').open('a')
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            locks.append(lock)
        else:
            if unit not in ('wordbase-api', 'wordbase-rebuild.path'):
                raise ValueError('Not a Wordbase runtime unit')
            subprocess.run(['systemctl', action, unit], check=True)
    for name in ['.deployment.lock', '.release.lock']:
        path = root/'packages/api/data'/name
        if path.is_symlink():
            raise SystemExit('Unsafe runtime lock')
    with (root/'packages/api/data/.deployment.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        transaction = Transaction(root, args.stage or root, args.backup.resolve(), Path('/etc/systemd/system'), service, lambda: revision(root))
        if args.command == 'apply':
            transaction.install((HERE/'wordbase-api-runtime.conf').read_text(), (HERE/'wordbase-rebuild-runtime.conf').read_text())
        else:
            state = json.loads((args.backup/'state.json').read_text())
            if state.get('restored'):
                raise SystemExit('Runtime transaction already restored; no service changes')
            if state['root'] != str(root) or state['revision'] != revision(root):
                raise SystemExit('Source changed: runtime rollback refused before service changes')
            service('quiesce', None)
            transaction.restore(state)
    for lock in locks:
        lock.close()


if __name__ == '__main__':
    main()
