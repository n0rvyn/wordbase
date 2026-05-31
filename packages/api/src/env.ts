/**
 * Project-root .env loader (zero-dependency, idempotent).
 *
 * Loads `<repo-root>/.env` into process.env so every entry point (server, CLI,
 * MCP, migrate) reads the SAME single env file regardless of cwd. Variables
 * already present in process.env are NEVER overridden — so on production, where
 * systemd injects the same file via `EnvironmentFile=/var/www/wordbase/.env`,
 * those values win and this is a harmless no-op.
 *
 * Import this FIRST, before any module that reads process.env at load time
 * (e.g. db/index.ts reads WORDBASE_DB_PATH on import).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { REPO_ROOT } from './paths.js';

const ENV_PATH = resolve(REPO_ROOT, '.env');

try {
  const text = readFileSync(ENV_PATH, 'utf-8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
} catch {
  // No root .env (CI/tests, or prod where systemd already provided the vars) — fine.
}
