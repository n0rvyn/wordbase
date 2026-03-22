import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

interface BuildState {
  status: 'idle' | 'building' | 'success' | 'failed';
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  duration: number | null;
}

let currentBuild: BuildState = {
  status: 'idle',
  startedAt: null,
  completedAt: null,
  error: null,
  duration: null,
};

export function getBuildStatus(): BuildState {
  return { ...currentBuild };
}

export async function triggerBuild(): Promise<BuildState> {
  if (currentBuild.status === 'building') {
    return currentBuild;
  }

  currentBuild = {
    status: 'building',
    startedAt: Date.now(),
    completedAt: null,
    error: null,
    duration: null,
  };

  // Run build in background (non-blocking)
  const projectRoot = join(process.cwd(), '..');
  const webDir = join(projectRoot, 'web');

  execAsync(`cd "${webDir}" && pnpm build`, { timeout: 120000 })
    .then(() => {
      currentBuild = {
        ...currentBuild,
        status: 'success',
        completedAt: Date.now(),
        duration: Date.now() - (currentBuild.startedAt || Date.now()),
        error: null,
      };
    })
    .catch((err: any) => {
      currentBuild = {
        ...currentBuild,
        status: 'failed',
        completedAt: Date.now(),
        duration: Date.now() - (currentBuild.startedAt || Date.now()),
        error: err.stderr || err.message || 'Build failed',
      };
    });

  return currentBuild;
}
