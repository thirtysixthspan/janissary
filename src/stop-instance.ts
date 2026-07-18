import { readLockPid, isPidAlive } from './instance-lock.js';

// Handle `janus stop [<project-dir>]`: signal the running instance for the target directory to
// shut down gracefully (the existing SIGTERM handler in `boot()`), or report that none is running.
export function stopInstance(projectDir: string): void {
  const pid = readLockPid(projectDir);
  if (pid !== undefined && isPidAlive(pid)) {
    process.kill(pid, 'SIGTERM');
    return;
  }
  process.stdout.write(`no running janus instance for ${projectDir}\n`);
}
