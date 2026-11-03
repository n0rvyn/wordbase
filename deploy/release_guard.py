#!/usr/bin/env python3
"""Read-only release guards; the runtime inventory contains hashes, never values."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path


RUNTIME_DIRS = ('packages/api/data/.cache/', 'packages/api/data/.local/')
RUNTIME_FILES = (
    'packages/api/data/blog.db.bak-pageviews-20260604-125139',
    'packages/api/data/build-status.json',
    'packages/api/data/.release.lock',
    'packages/api/data/.deployment.lock',
)


def digest(path):
    result = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args])


def inventory(root):
    root = root.resolve(strict=True)
    for args in [('diff', '--quiet'), ('diff', '--cached', '--quiet')]:
        subprocess.run(['git', '-C', str(root), *args], check=True)
    entries = []
    for name in git(root, 'ls-files', '--others', '--exclude-standard', '-z').decode().split('\0'):
        if not name:
            continue
        if name not in RUNTIME_FILES and not name.startswith(RUNTIME_DIRS):
            raise ValueError('Unaccounted untracked entry: ' + name)
    # Inventory even ignored runtime entries, without broadening the allowance.
    for name in [*RUNTIME_FILES, *(s.rstrip('/') for s in RUNTIME_DIRS)]:
        path = root / name
        if path.is_symlink():
            raise ValueError('Runtime symlink is not allowed: ' + name)
        if not path.exists():
            continue
        if name.endswith('.lock'):
            if not path.is_file(): raise ValueError('Invalid runtime lock: ' + name)
            continue
        files = path.rglob('*') if path.is_dir() else [path]
        for item in files:
            if item.is_symlink():
                # pnpm caches may contain links. Inventory the link itself,
                # never inspect or copy its target outside these runtime dirs.
                target = str(item.readlink())
                entries.append({'path': str(item.relative_to(root)), 'type': 'symlink',
                                'target': target, 'sha256': hashlib.sha256(target.encode()).hexdigest()})
                continue
            if item.is_dir():
                continue
            if not item.is_file() or root not in item.resolve().parents:
                raise ValueError('Invalid runtime file: ' + str(item))
            entries.append({'path': str(item.relative_to(root)), 'bytes': item.stat().st_size,
                            'sha256': digest(item)})
    return sorted(entries, key=lambda row: row['path'])


def dependencies(root, revision):
    allowed = []
    for name in ['package.json', 'packages/api/package.json', 'packages/web/package.json',
                 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.node-version', '.nvmrc']:
        result = subprocess.run(['git', '-C', str(root), 'show', revision + ':' + name],
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        path = root / name
        if result.returncode and not path.exists():
            continue
        if result.returncode or not path.is_file():
            raise ValueError('Dependency input added/removed: ' + name)
        current = path.read_bytes()
        if current == result.stdout:
            continue
        if name.endswith('package.json'):
            before, after = json.loads(result.stdout), json.loads(current)
            before.pop('version', None)
            after.pop('version', None)
            if before == after:
                allowed.append(name)
                continue
        raise ValueError('Dependency inputs changed; rollback is unsafe: ' + name)
    return {'versionOnlyDifferences': allowed}


if __name__ == '__main__':
    try:
        command, directory, *args = sys.argv[1:]
        root = Path(directory).resolve(strict=True)
        result = inventory(root) if command == 'inventory' else dependencies(root, args[0])
        print(json.dumps(result, indent=2))
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
