import { execFileSync } from 'node:child_process';

// A denied `process.kill(pid, 0)` no longer proves the pid belongs to another account: a sandbox
// that permits signalling only descendants denies it for the detached janus this account started.
// Asking the process table for the owner separates that case from a genuinely foreign pid without
// changing the bare-pid lock file. No owner to read means no process holds the pid.
export function pidBelongsToCurrentUser(pid: number): boolean {
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (uid === undefined) return false;
  try {
    const output = execFileSync('ps', ['-p', String(pid), '-o', 'uid='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output !== '' && output.split(/\s+/u).some((value) => Number(value) === uid);
  } catch {
    return false;
  }
}
