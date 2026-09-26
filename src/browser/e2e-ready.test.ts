import { describe, expect, it, vi } from 'vitest';
import { newSession, stopSession, type E2ESession } from './e2e-session.js';
import { waitForListening, type PortProbe } from './e2e-ready.js';

// The wait that turns a spawn into a browser.
//
// What is being pinned is the decision — does the wait keep looking, resolve, or give up, and which
// reason it gives — and the question it asks is handed in as a `PortProbe`. So the sequence a real
// launch produces (nothing yet, nothing yet, then the browser) is described directly rather than
// raced against real listeners, and the cases are exact instead of timed. The production path still
// asks the operating system: `waitForListening`'s default probe is the socket one.

const PORT = 51_234;

// Long enough for the probe to have run several times, short enough to keep the suite quick.
const PATIENCE = 60;

const session = (): E2ESession => newSession(vi.fn());

// A probe that answers the given sequence, one answer per call, and its last answer thereafter.
function answering(...answers: boolean[]): PortProbe {
  let asked = 0;
  return vi.fn(async () => answers[Math.min(asked++, answers.length - 1)] ?? false);
}

// Whether the wait had already settled when the grace period elapsed.
async function settled(promise: Promise<unknown>): Promise<boolean> {
  const answer = { done: false };
  void promise.then(() => { answer.done = true; }, () => { answer.done = true; });
  await new Promise((resolve) => setTimeout(resolve, PATIENCE));
  return answer.done;
}

describe('waitForListening', () => {
  it('resolves as soon as a probe says something is listening', async () => {
    const probe = answering(true);
    await expect(waitForListening(session(), PORT, PATIENCE, probe)).resolves.toBeUndefined();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('asks about the port it was given', async () => {
    const probe = answering(true);
    await waitForListening(session(), PORT, PATIENCE, probe);
    expect(probe).toHaveBeenCalledWith(PORT);
  });

  it('keeps waiting while nothing is listening, and resolves the moment a probe says it is', async () => {
    // The launch that this wait exists for: a child that is up and has not bound yet. Four refusals
    // first, so the answer lands after the grace period the case checks with.
    const probe = answering(false, false, false, false, true);
    const pending = waitForListening(session(), PORT, PATIENCE * 100, probe);
    expect(await settled(pending)).toBe(false);

    await expect(pending).resolves.toBeUndefined();
    expect(probe.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  // The case the wait exists for: a child that fails to launch exits after the spawn returned, and
  // its exit is the only account of why the port is not coming.
  it('rejects with the exit itself when the child is gone before the port is bound', async () => {
    const probe = answering(false);
    const dead = session();
    const pending = waitForListening(dead, PORT, PATIENCE * 100, probe);
    stopSession(dead, 'e2e browser exited');
    await expect(pending).rejects.toThrow('e2e browser exited before it was listening');
  });

  // The child's exit is read between probes, so a child already gone is never dialled at all.
  it('does not ask about the port once the child is known to be gone', async () => {
    const probe = answering(false);
    const dead = session();
    stopSession(dead, 'e2e browser exited');
    await expect(waitForListening(dead, PORT, PATIENCE, probe)).rejects.toThrow('e2e browser exited');
    expect(probe).not.toHaveBeenCalled();
  });

  it('ends the wait on its bound rather than holding it open forever', async () => {
    const probe = answering(false);
    await expect(waitForListening(session(), PORT, PATIENCE, probe))
      .rejects.toThrow('e2e browser did not start listening in time');
  });

  it('does not keep probing after its bound has passed', async () => {
    const probe = answering(false);
    await expect(waitForListening(session(), PORT, 0, probe))
      .rejects.toThrow('e2e browser did not start listening in time');
    expect(probe).toHaveBeenCalledTimes(1);
  });
});
