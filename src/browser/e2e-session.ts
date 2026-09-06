import type { ChildProcess } from 'node:child_process';
import { childOutputTail, withChildOutput, type ChildOutputTail } from '../child-output.js';
import type { E2EGuardHandle } from './e2e-guard.js';
import type { BrowserPorts } from './e2e-ports.js';
import type { BrowserScratch } from './e2e-scratch.js';

// What one e2e browser launch acquired, and the single way any of it is released.
//
// A browser can end four ways — the user closes the tab, the guard cannot bind, the child never
// starts, the child exits — and only the first of them used to release anything. The other three
// notified and left the rest running: a guard listening in front of nothing, or a confined Chromium
// and its scratch directory with no route to them. The slots below are filled in as each resource is
// acquired, so a failure part-way through setup also gives back what it took — every part of it
// except the scratch directory, which the three unasked-for endings keep on purpose (see `release`).

export type E2ESession = {
  // `closed` is set by the first teardown, whatever caused it; `fired` records that the user has
  // already been told. Together they are what keeps the notification exactly-once and silent after
  // a close the user asked for.
  closed: boolean;
  fired: boolean;
  onGone: (message: string) => void;
  // What the confined child said before it went. Held here rather than beside the spawn because
  // `stopSession` is the one place every message passes through, so composing it here covers the
  // child that exits, the child that never starts, and the guard that dies, without three call
  // sites repeating it.
  output: ChildOutputTail;
  guard?: E2EGuardHandle;
  child?: ChildProcess;
  scratch?: BrowserScratch;
  ports?: BrowserPorts;
};

export function newSession(onGone: (message: string) => void): E2ESession {
  return { closed: false, fired: false, onGone, output: childOutputTail() };
}

/**
 * Give back everything the launch acquired. With `keepScratch`, everything except the directory the
 * browser lived in: Chromium's user data directory, its temp sibling, and any crash dump it managed
 * to write are all inside that pair, and a browser that died is the one case where they are worth
 * reading. Removing them milliseconds after the death, before anyone has even been told there was
 * one, is what left nothing to diagnose.
 *
 * Nothing else is held back. The guard closes, the child is killed, and the ports go back to the
 * band — a kept directory is evidence, not a browser still running, and holding two ports out of a
 * finite band to preserve one would cost a later launch its browser.
 *
 * The kept pair lives until janissary next starts, which sweeps every direct child of the workspace
 * root and so reaches the container these sit in (see `e2e-scratch.ts`). No teardown removes it
 * after the fact — closing the dead browser's tab is the first thing a user does after being told
 * about it, so removing it there would sweep the post-mortem away with the reflex that follows
 * reading about it.
 */
function release(session: E2ESession, keepScratch: boolean): void {
  session.guard?.close();
  try { session.child?.kill(); } catch { /* already gone */ }
  if (!keepScratch) session.scratch?.remove();
  session.ports?.release();
}

/**
 * End the session and release whatever it holds. With a `message`, the browser is gone for a reason
 * the user did not ask for and the message is delivered once; without one, the user closed the tab
 * and nothing is reported. That same distinction decides whether the scratch directory survives to
 * be read, which is why `release` needs nothing tracked for it — a death is exactly a teardown
 * carrying something to say.
 *
 * The order matters in three ways. Whether to notify is decided before the session is marked down,
 * so a failure still reports. The session is marked down before anything is released, so the exit
 * that killing the child provokes is suppressed rather than re-entering this. And the notification
 * is last, so what it describes is already gone by the time the user reads it.
 *
 * The child's own output is read out before the release kills it, so what the message carries is
 * everything the browser managed to say rather than everything it said before the kill.
 */
export function stopSession(session: E2ESession, message?: string): void {
  const wasDown = session.closed;
  const notifying = message !== undefined && !wasDown && !session.fired;
  if (notifying) session.fired = true;
  session.closed = true;
  const reported = notifying && message !== undefined ? withChildOutput(message, session.output.text()) : undefined;
  if (!wasDown) release(session, message !== undefined);
  if (reported !== undefined) session.onGone(reported);
}
