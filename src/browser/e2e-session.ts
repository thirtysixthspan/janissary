import type { ChildProcess } from 'node:child_process';
import type { E2EGuardHandle } from './e2e-guard.js';
import type { BrowserPorts } from './e2e-ports.js';
import type { BrowserScratch } from './e2e-scratch.js';

// What one e2e browser launch acquired, and the single way any of it is released.
//
// A browser can end four ways — the user closes the tab, the guard cannot bind, the child never
// starts, the child exits — and only the first of them used to release anything. The other three
// notified and left the rest running: a guard listening in front of nothing, or a confined Chromium
// and its scratch directory with no route to them. The slots below are filled in as each resource is
// acquired, so a failure part-way through setup also gives back exactly what it took.

export type E2ESession = {
  // `closed` is set by the first teardown, whatever caused it; `fired` records that the user has
  // already been told. Together they are what keeps the notification exactly-once and silent after
  // a close the user asked for.
  closed: boolean;
  fired: boolean;
  onGone: (message: string) => void;
  guard?: E2EGuardHandle;
  child?: ChildProcess;
  scratch?: BrowserScratch;
  ports?: BrowserPorts;
};

export function newSession(onGone: (message: string) => void): E2ESession {
  return { closed: false, fired: false, onGone };
}

function release(session: E2ESession): void {
  session.guard?.close();
  try { session.child?.kill(); } catch { /* already gone */ }
  session.scratch?.remove();
  session.ports?.release();
}

/**
 * End the session and release whatever it holds. With a `message`, the browser is gone for a reason
 * the user did not ask for and the message is delivered once; without one, the user closed the tab
 * and nothing is reported.
 *
 * The order matters in three ways. Whether to notify is decided before the session is marked down,
 * so a failure still reports. The session is marked down before anything is released, so the exit
 * that killing the child provokes is suppressed rather than re-entering this. And the notification
 * is last, so what it describes is already gone by the time the user reads it.
 */
export function stopSession(session: E2ESession, message?: string): void {
  const wasDown = session.closed;
  const notifying = message !== undefined && !wasDown && !session.fired;
  if (notifying) session.fired = true;
  session.closed = true;
  if (!wasDown) release(session);
  if (notifying && message !== undefined) session.onGone(message);
}
