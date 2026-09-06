// How a process ended, in the two terms the operating system gives for it, and one phrasing of them
// shared by everyone who reports one. Two processes end on the browser's death path — Chromium,
// watched by the `janus e2e-browser` child, and that child, watched by the janissary server — and
// each is the only one that can see the status of the one it watches. They report on separate lines
// of the same message, so they format identically here rather than each inventing a wording.

// Node hands a code and a signal in three shapes across the two APIs this covers: `ChildProcess`
// exposes `exitCode`/`signalCode` as `number | null`, an `exit` handler is passed the same pair, and
// a process observed before it has ended has neither. All three arrive here as this.
export type ProcessEnd = {
  code?: number | null;
  signal?: NodeJS.Signals | string | null;
};

/**
 * The exit status as a short phrase — `signal SIGKILL`, `code 1`, `code 0` — or `undefined` when
 * neither is known.
 *
 * The signal wins when both are present: a process killed by a signal is also reported with a code,
 * and the signal is the part that says something happened to it. `undefined` rather than a phrase
 * naming nothing, so a caller with no status can stay silent instead of reporting `code null`.
 */
export function processEndDetail(end: ProcessEnd): string | undefined {
  if (end.signal) return `signal ${end.signal}`;
  if (typeof end.code === 'number') return `code ${end.code}`;
  return undefined;
}

/**
 * `message` with the exit status in parentheses after it, or `message` alone when there is no status
 * to name. The bare form is the wording every one of these messages had before an exit status was
 * available, which is what keeps a report with nothing to add reading exactly as it always did.
 */
export function withEndDetail(message: string, end: ProcessEnd): string {
  const detail = processEndDetail(end);
  return detail ? `${message} (${detail})` : message;
}

/**
 * Whether the process ended the way a shutdown someone asked for ends: code zero, no signal.
 *
 * Anything else is not clean, including a status the platform did not report — an end nobody can
 * account for is not evidence of a graceful one.
 */
export function endedCleanly(end: ProcessEnd): boolean {
  return !end.signal && end.code === 0;
}
