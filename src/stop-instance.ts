import { readLockPid, isOwnInstanceAlive } from './instance-lock.js';
import { writeStopRequest } from './stop-request.js';

// Handle `janus stop [<project-dir>]`: signal the running instance for the target directory to
// shut down gracefully (the existing SIGTERM handler in `boot()`), or report that none is running.
// A sandbox that denies the signal leaves a stop request in that directory instead; the server
// picks it up and takes its own graceful shutdown path.
export function stopInstance(projectDir: string): void {
  const pid = readLockPid(projectDir);
  // The narrow probe, not `isPidAlive`: a recorded pid this user cannot signal is not the instance
  // the lock names, and taking it for one would throw on the SIGTERM below instead of reporting.
  if (pid !== undefined && isOwnInstanceAlive(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
      writeStopRequest(projectDir, pid);
    }
    return;
  }
  process.stdout.write(`no running janus instance for ${projectDir}\n`);
}
