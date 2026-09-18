import { readLockPid, isOwnInstanceAlive } from './instance-lock.js';

// Handle `janus stop [<project-dir>]`: signal the running instance for the target directory to
// shut down gracefully (the existing SIGTERM handler in `boot()`), or report that none is running.
export function stopInstance(projectDir: string): void {
  const pid = readLockPid(projectDir);
  // The narrow probe, not `isPidAlive`: a recorded pid this user cannot signal is not the instance
  // the lock names, and taking it for one would throw on the SIGTERM below instead of reporting.
  if (pid !== undefined && isOwnInstanceAlive(pid)) {
    process.kill(pid, 'SIGTERM');
    return;
  }
  process.stdout.write(`no running janus instance for ${projectDir}\n`);
}
