import { execFileSync } from 'node:child_process';

// A denied `process.kill(pid, 0)` no longer proves the pid belongs to another account: a sandbox
// that permits signalling only descendants denies it for the detached janus this account started.
// Asking the process table for the owner separates that case from a genuinely foreign pid without
// changing the bare-pid lock file. A matching uid says ours, a foreign uid or a missing pid says not
// ours, and an unreadable process table says undefined so lock callers can fail closed.
export function pidBelongsToCurrentUser(pid: number): boolean | undefined {
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (uid === undefined) return false;
  try {
    const output = execFileSync('ps', ['-p', String(pid), '-o', 'uid='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return output !== '' && output.split(/\s+/u).some((value) => Number(value) === uid);
  } catch (error) {
    // An OS-level failure (a string code such as EPERM or ENOENT) means the query itself is
    // unavailable; an exited `ps` (a numeric exit code) is a definitive answer that the pid is not
    // ours. Only the first keeps a denied signal probe from calling a live pid stale.
    return typeof (error as NodeJS.ErrnoException).code === 'string' ? undefined : false;
  }
}
