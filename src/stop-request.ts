import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { atomicWriteFile } from './atomic-write.js';

// A sandbox can deny a signal to the detached server this account started, so `janus stop` leaves a
// request in the target's own state directory instead. Only that directory's server watches it, and
// only a request naming its own pid makes it shut down. The poll is unref'd and needs no permission
// the sandbox withholds.
export const STOP_REQUEST_TICK_MS = 200;

export function stopRequestPath(projectDir: string): string {
  return path.join(projectDir, '.janissary', 'stop-request');
}

export function writeStopRequest(projectDir: string, pid: number): void {
  const file = stopRequestPath(projectDir);
  mkdirSync(path.dirname(file), { recursive: true });
  atomicWriteFile(file, `${pid}\n`);
}

export function clearStopRequest(projectDir: string): void {
  rmSync(stopRequestPath(projectDir), { force: true });
}

export function watchStopRequest(projectDir: string, onStop: () => void): () => void {
  const timer = setInterval(() => {
    let content: string;
    try {
      content = readFileSync(stopRequestPath(projectDir), 'utf8');
    } catch {
      return;
    }
    clearStopRequest(projectDir);
    const pid = Number(content.trim());
    if (pid !== process.pid) return;
    clearInterval(timer);
    onStop();
  }, STOP_REQUEST_TICK_MS);
  timer.unref();
  return () => clearInterval(timer);
}
