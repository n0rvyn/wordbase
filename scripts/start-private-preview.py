#!/usr/bin/env python3
"""Start the offline loopback review independently of the agent terminal."""
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.preview'
URL = 'http://127.0.0.1:4413/__review'


def ready():
    try:
        with urllib.request.urlopen(URL, timeout=1) as response:
            return response.status == 200 and b'Wordbase' in response.read()
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


if ready():
    print(f'Wordbase review already running: {URL}')
    raise SystemExit(0)

if not (ROOT / 'packages/web/dist/index.html').is_file():
    raise SystemExit('Build Wordbase before starting the private preview.')
STATE.mkdir(exist_ok=True)
with (STATE / 'review-server.log').open('ab') as log:
    process = subprocess.Popen(
        [sys.executable, '-u', str(ROOT / 'scripts/preview-readonly.py'),
         '--port', '4413', '--offline',
         *(['--catalog-review'] if (STATE / 'catalog-review/apps.json').is_file() else []),
         *(['--promo-review'] if (STATE / 'promos-review/assignments.json').is_file() else [])],
        cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
        start_new_session=True, close_fds=True,
    )
    for _ in range(50):
        if process.poll() is not None:
            raise SystemExit('Preview exited; inspect .preview/review-server.log')
        if ready():
            (STATE / 'review-server.json').write_text(json.dumps({
                'pid': process.pid, 'url': URL, 'offline': True,
                'binding': '127.0.0.1:4413', 'detached': True,
            }, indent=2))
            print(f'Wordbase review running independently (PID {process.pid}): {URL}')
            break
        time.sleep(0.1)
    else:
        raise SystemExit('Preview did not become ready; inspect .preview/review-server.log')
