// Ending everything a PTY started, not just the process it was spawned with. `node-pty` starts each
// program as the leader of a new session, so its pid is also its process-group id, and everything it
// forks — a harness's MCP servers, helpers, and the shell commands it runs — inherits that group.
// `node-pty`'s own `kill()` sends SIGHUP to the leader alone: a child that ignores SIGHUP outlives the
// tab, and anything still running when the leader exits on its own is orphaned with it.
//
// A process that leaves the group on purpose (`setsid`, a double-forked daemon) is out of reach
// here. That is what codex's shared background server was, and `--no-daemon` on the codex launch is
// what keeps it from starting (see `LAUNCH_ARGS` in `harness/index.ts`).

// How long the group is given to exit on SIGTERM before whatever is left is sent SIGKILL.
export const PTY_REAP_GRACE_MS = 2000;

export type SendSignal = (pid: number, signal: NodeJS.Signals) => void;

const sendSignal: SendSignal = (pid, signal) => { process.kill(pid, signal); };

// `kill(0)` would signal janus's own process group and `kill(-1)` every process the user owns, so
// only an id that can name some other process's group is ever turned into a negative pid.
function isReapable(pgid: number | undefined): pgid is number {
  return pgid !== undefined && Number.isSafeInteger(pgid) && pgid > 1 && pgid !== process.pid;
}

// Whether the signal reached anything. An empty or vanished group answers ESRCH.
function signalGroup(pgid: number, signal: NodeJS.Signals, send: SendSignal): boolean {
  try {
    send(-pgid, signal);
    return true;
  } catch {
    return false;
  }
}

// SIGTERM to every process in the group, then SIGKILL to whatever is still there once the grace has
// passed. A group that was already empty gets no second signal, which keeps the window in which its
// id could be reused by an unrelated group as short as it can be. The timer is unref'd so a pending
// reap never holds the server open at shutdown.
export function reapProcessGroup(
  pgid: number | undefined,
  send: SendSignal = sendSignal,
  graceMs = PTY_REAP_GRACE_MS,
): void {
  if (!isReapable(pgid)) return;
  if (!signalGroup(pgid, 'SIGTERM', send)) return;
  setTimeout(() => { signalGroup(pgid, 'SIGKILL', send); }, graceMs).unref();
}
