#!/usr/bin/env node
// Detects semver bump type from conventional commits since the last tag.
// Output: major | minor | patch | none  (to $GITHUB_OUTPUT in CI, else stdout)

import { execFileSync } from 'child_process';
import parser from 'conventional-commits-parser';

const lastTag = (() => {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
})();

const range = lastTag ? `${lastTag}..HEAD` : 'HEAD';

const subjects = execFileSync('git', ['log', range, '--pretty=format:%s'], { encoding: 'utf8' });

let hasBreaking = false;
let hasFeature = false;
let hasFixPerfRefactor = false;

for (const line of subjects.split('\n')) {
  if (!line || line.startsWith('Merge ')) continue;

  const parsed = parser.sync(line);
  if (!parsed.type) {
    // `type!: ...` breaking commits parse to type=null; catch them by the marker.
    if (line.includes('!:')) hasBreaking = true;
    continue;
  }

  const isBreaking =
    parsed.notes.some((n) => n.title === 'BREAKING CHANGE') || line.includes('!:');

  if (isBreaking) {
    hasBreaking = true;
  } else if (parsed.type === 'feat') {
    hasFeature = true;
  } else if (['fix', 'perf', 'refactor'].includes(parsed.type)) {
    hasFixPerfRefactor = true;
  }
}

let type = 'none';
if (hasBreaking) type = 'major';
else if (hasFeature) type = 'minor';
else if (hasFixPerfRefactor) type = 'patch';

if (process.env.GITHUB_OUTPUT) {
  const fs = await import('fs');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `type=${type}\n`);
} else {
  console.log(type);
}
