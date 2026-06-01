import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { REPO_ROOT } from '../paths.js';

/**
 * Decoupled static-site rebuild.
 *
 * The API runs inside a strict systemd sandbox (ProtectSystem=strict) that can
 * only write packages/api/data — it deliberately CANNOT write the web build
 * output. So instead of running `pnpm build` in-process (which fails silently
 * under the sandbox), triggerBuild() just drops a request marker in the data
 * dir. A separate, non-web-facing systemd unit (wordbase-rebuild.path →
 * wordbase-rebuild.service) watches that file and runs the real build outside
 * the sandbox, writing build-status.json back here for getBuildStatus() to read.
 */

export interface BuildState {
  status: 'idle' | 'requested' | 'building' | 'success' | 'failed';
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  duration: number | null;
}

const DATA_DIR = join(REPO_ROOT, 'packages/api/data');
const REQUEST_FILE = join(DATA_DIR, '.rebuild-request');
const STATUS_FILE = join(DATA_DIR, 'build-status.json');

export function getBuildStatus(): BuildState {
  try {
    if (existsSync(STATUS_FILE)) {
      return JSON.parse(readFileSync(STATUS_FILE, 'utf8')) as BuildState;
    }
  } catch {
    // Corrupt/partial status file — fall through to idle.
  }
  return { status: 'idle', startedAt: null, completedAt: null, error: null, duration: null };
}

export async function triggerBuild(): Promise<BuildState> {
  const now = Date.now();
  try {
    // Touch the request marker; the wordbase-rebuild.path unit fires on modify.
    writeFileSync(REQUEST_FILE, `${now}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 'failed', startedAt: now, completedAt: now, error: `Failed to queue rebuild: ${message}`, duration: 0 };
  }
  return { status: 'requested', startedAt: now, completedAt: null, error: null, duration: null };
}
