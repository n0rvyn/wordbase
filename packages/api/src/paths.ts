/**
 * Repo-root anchor. Pure (no side effects) so it's safe to import anywhere.
 * Resolves to the monorepo root regardless of cwd or compiled/source layout:
 * src/paths.ts and dist/paths.js both sit one level under packages/api.
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
