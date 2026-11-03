#!/usr/bin/env python3
"""Verify an isolated native dependency candidate; never opens the live DB."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root', type=Path, required=True)
parser.add_argument('--stage', type=Path, required=True)
parser.add_argument('--node', type=Path, required=True)
parser.add_argument('--pnpm-cli', type=Path, required=True)
parser.add_argument('--platform', choices=['linux', 'darwin'], required=True)
args = parser.parse_args()
root, stage = args.root.resolve(strict=True), args.stage.resolve(strict=True)
for name in ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','packages/api/package.json','packages/web/package.json']:
    if (root/name).read_bytes() != (stage/name).read_bytes():
        raise SystemExit('Candidate dependency input differs: '+name)
probe = json.loads(subprocess.check_output([str(args.node), '-e',
    "const D=require(process.argv[1]);const d=new D(':memory:');const sqlite=d.prepare('select sqlite_version() version').get();d.close();console.log(JSON.stringify({node:process.version,abi:process.versions.modules,platform:process.platform,arch:process.arch,sqlite}))",
    str(stage/'packages/api/node_modules/better-sqlite3')], text=True))
if any(probe[key] != expected for key,expected in {'node':'v24.22.2','abi':'137','platform':args.platform,'arch':'x64'}.items()):
    raise SystemExit('Unexpected Node/native runtime: '+str(probe))
pnpm = subprocess.check_output([str(args.node), str(args.pnpm_cli), '--version'], text=True).strip()
if pnpm != '10.28.2':
    raise SystemExit('Unexpected private pnpm version')
report = {**probe, 'pnpm':pnpm, 'revision':subprocess.check_output(['git','-C',str(root),'rev-parse','HEAD'],text=True).strip(),
          'lockSHA256':hashlib.sha256((root/'pnpm-lock.yaml').read_bytes()).hexdigest(), 'liveDatabaseOpened':False}
(stage/'runtime-stage.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
