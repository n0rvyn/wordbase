#!/usr/bin/env node
// Generates / prepends CHANGELOG.md from git history using conventional commits.
// Usage: node scripts/generate-changelog.mjs <lastTag> <newVersion>

import { execFileSync } from 'child_process';
import parser from 'conventional-commits-parser';
import { writeFileSync, readFileSync } from 'fs';

const [lastTag = 'v0.0.0', newVersion = ''] = process.argv.slice(2);

// Cold start: on the first release no tag exists, and CI passes the sentinel
// "v0.0.0". Fall back to full history rather than `git log v0.0.0..HEAD`, which
// fatals when the tag is absent. Also covers a stale/garbage tag argument.
function resolveRange(tag) {
  if (!tag || tag === 'v0.0.0') return 'HEAD';
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${tag}^{commit}`], {
      stdio: 'ignore',
    });
    return `${tag}..HEAD`;
  } catch {
    return 'HEAD';
  }
}

const range = resolveRange(lastTag);

const logOutput = execFileSync(
  'git',
  ['log', range, '--pretty=format:%H|%s%n%b%n---'],
  { encoding: 'utf8' },
);

const groups = { features: [], bugFixes: [], performance: [], refactors: [], breaking: [] };

for (const block of logOutput.split('\n---\n')) {
  const lines = block.trim().split('\n');
  if (!lines[0]) continue;

  const [hash, ...rest] = lines[0].split('|');
  const subject = rest.join('|');
  const body = lines.slice(1).join('\n').replace(/\n---$/, '').trim();

  const parsed = parser.sync(subject);
  if (parsed.type === 'merge') continue;

  const bodyLines = body.split('\n');
  const hasBreakingFooter = bodyLines.some(
    (line) => /^BREAKING CHANGE:\s*/.test(line.trim()) || /^BREAKING:\s*/.test(line.trim()),
  );
  const hasBreakingMarker = subject.includes('!:');
  const hasBreaking = hasBreakingFooter || hasBreakingMarker;

  if (!parsed.type && !hasBreaking) continue;

  const entry = `- ${subject} (${hash.substring(0, 7)})`;

  if (hasBreaking) groups.breaking.push(entry);
  else if (parsed.type === 'feat') groups.features.push(entry);
  else if (parsed.type === 'fix') groups.bugFixes.push(entry);
  else if (parsed.type === 'perf') groups.performance.push(entry);
  else if (parsed.type === 'refactor') groups.refactors.push(entry);
  // chore, docs, test, config, ci, build, style, revert → ignored
}

let changelog = `# Changelog\n\n`;
changelog += `## v${newVersion} (${new Date().toISOString().split('T')[0]})\n\n`;

if (groups.breaking.length > 0)
  changelog += `### BREAKING CHANGES\n\n${groups.breaking.join('\n')}\n\n`;
if (groups.features.length > 0) changelog += `### Features\n\n${groups.features.join('\n')}\n\n`;
if (groups.bugFixes.length > 0) changelog += `### Bug Fixes\n\n${groups.bugFixes.join('\n')}\n\n`;
if (groups.performance.length > 0)
  changelog += `### Performance\n\n${groups.performance.join('\n')}\n\n`;
if (groups.refactors.length > 0)
  changelog += `### Refactoring\n\n${groups.refactors.join('\n')}\n\n`;

let existing = '';
try {
  existing = readFileSync('CHANGELOG.md', 'utf8');
} catch {
  // no existing changelog
}
const existingContent = existing.replace(/^# Changelog\n\n## v[\d.]+ .*\n\n/, '');

writeFileSync('CHANGELOG.md', changelog + existingContent);
console.log(`Generated CHANGELOG.md for v${newVersion}`);
