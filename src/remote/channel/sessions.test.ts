import { describe, it, expect, vi } from 'vitest';
import { SessionRouter, type SessionListener } from './sessions.js';

// `SessionRouter` is `RemoteChannel`'s routing table for everything keyed by a process id — no
// dedicated test file exists today (it is exercised indirectly through `index.test.ts`); this one
// covers the gate-event/busy-transition routing the auto-accept-while-detached plan adds, following
// the same hold-until-listener contract `output`/`shell-history`/`exit` already have.

function listener(): SessionListener & { onOutput: ReturnType<typeof vi.fn>; onExit: ReturnType<typeof vi.fn>; onGateEvent: ReturnType<typeof vi.fn>; onBusyTransition: ReturnType<typeof vi.fn>; onResumeEvent: ReturnType<typeof vi.fn> } {
  return {
    onOutput: vi.fn(), onExit: vi.fn(), onGateEvent: vi.fn(), onBusyTransition: vi.fn(), onResumeEvent: vi.fn(),
  };
}

describe('SessionRouter — gate-event', () => {
  it('delivers live to a registered listener', () => {
    const router = new SessionRouter({});
    const l = listener();
    router.attach('r1', l);
    router.gateEvent({ type: 'gate-event', id: 'r1', message: 'Auto-approved a permission prompt', capturedAt: 1000, capture: 'text' });
    expect(l.onGateEvent).toHaveBeenCalledWith('Auto-approved a permission prompt', 1000, false, 'text');
  });

  it('is dropped for an unregistered id on an ordinary channel (not mid-attach)', () => {
    const router = new SessionRouter({});
    expect(() => router.gateEvent({ type: 'gate-event', id: 'r1', message: 'x', capturedAt: 1 })).not.toThrow();
    const l = listener();
    router.attach('r1', l);
    expect(l.onGateEvent).not.toHaveBeenCalled();
  });

  it('is held for an id whose tab is still being built, then delivered on attach, in arrival order alongside output', () => {
    const router = new SessionRouter({});
    router.openHold();
    router.output({ type: 'output', id: 'r1', data: 'before' });
    router.gateEvent({ type: 'gate-event', id: 'r1', message: 'Auto-approved a permission prompt', capturedAt: 1000, capture: 'text' });
    router.output({ type: 'output', id: 'r1', data: 'after' });
    const l = listener();
    const calls: string[] = [];
    l.onOutput.mockImplementation((data: string) => { calls.push(`output:${data}`); });
    l.onGateEvent.mockImplementation((message: string) => { calls.push(`gate:${message}`); });
    router.attach('r1', l);
    expect(calls).toEqual(['output:before', 'gate:Auto-approved a permission prompt', 'output:after']);
    expect(l.onGateEvent).toHaveBeenCalledWith('Auto-approved a permission prompt', 1000, true, 'text');
  });
});

describe('SessionRouter — resume-event', () => {
  const reset = { kind: 'at', time: { hour: 13, minute: 20 } } as const;

  it('delivers live to a registered listener', () => {
    const router = new SessionRouter({});
    const l = listener();
    router.attach('r1', l);
    router.resumeEvent({ type: 'resume-event', id: 'r1', reset, capturedAt: 1000, capture: 'text' });
    expect(l.onResumeEvent).toHaveBeenCalledWith(reset, 1000, false, 'text');
  });

  it('is held for an id whose tab is still being built, then delivered on attach as a replay', () => {
    const router = new SessionRouter({});
    router.openHold();
    router.resumeEvent({ type: 'resume-event', id: 'r1', reset, capturedAt: 1000 });
    const l = listener();
    router.attach('r1', l);
    expect(l.onResumeEvent).toHaveBeenCalledWith(reset, 1000, true, undefined);
  });

  it('is dropped for an unregistered id on an ordinary channel, and after the hold closes', () => {
    const router = new SessionRouter({});
    router.resumeEvent({ type: 'resume-event', id: 'r1', reset, capturedAt: 1000 });
    const open = listener();
    router.attach('r1', open);
    expect(open.onResumeEvent).not.toHaveBeenCalled();
    const holding = new SessionRouter({});
    holding.openHold();
    holding.resumeEvent({ type: 'resume-event', id: 'r1', reset, capturedAt: 1000 });
    holding.discardUnclaimed();
    const late = listener();
    holding.attach('r1', late);
    expect(late.onResumeEvent).not.toHaveBeenCalled();
  });
});

describe('SessionRouter — busy-transition', () => {
  it('delivers live to a registered listener', () => {
    const router = new SessionRouter({});
    const l = listener();
    router.attach('r1', l);
    router.busyTransition({ type: 'busy-transition', id: 'r1', busy: true, unread: false });
    expect(l.onBusyTransition).toHaveBeenCalledWith(true, false);
  });

  it('is held for an id whose tab is still being built, then delivered on attach', () => {
    const router = new SessionRouter({});
    router.openHold();
    router.busyTransition({ type: 'busy-transition', id: 'r1', busy: false, unread: true });
    const l = listener();
    router.attach('r1', l);
    expect(l.onBusyTransition).toHaveBeenCalledWith(false, true);
  });

  it('is dropped for an unregistered id on an ordinary channel (not mid-attach)', () => {
    const router = new SessionRouter({});
    router.busyTransition({ type: 'busy-transition', id: 'r1', busy: true, unread: false });
    const l = listener();
    router.attach('r1', l);
    expect(l.onBusyTransition).not.toHaveBeenCalled();
  });

  it('is dropped once discardUnclaimed closes the hold window', () => {
    const router = new SessionRouter({});
    router.openHold();
    router.busyTransition({ type: 'busy-transition', id: 'r1', busy: true, unread: false });
    router.discardUnclaimed();
    const l = listener();
    router.attach('r1', l);
    expect(l.onBusyTransition).not.toHaveBeenCalled();
  });
});

describe('SessionRouter — shell process exit', () => {
  it('reports the shell exit without classifying it as a harness', () => {
    const onSessionExit = vi.fn();
    const router = new SessionRouter({ onSessionExit });
    router.record({
      type: 'spawn', id: 'shell1', program: 'zsh', command: 'zsh', mode: 'pty', cols: 80, rows: 24,
      shell: { nonce: 'a'.repeat(32) },
    });

    router.exit({ type: 'exit', id: 'shell1', exitCode: 0 });

    expect(onSessionExit).toHaveBeenCalledWith('shell1', undefined, false);
  });

  it('keeps a harness exit classified as a harness', () => {
    const onSessionExit = vi.fn();
    const router = new SessionRouter({ onSessionExit });
    router.record({
      type: 'spawn', id: 'harness1', program: 'claude', command: 'claude', mode: 'pty', cols: 80, rows: 24,
      harness: 'claude',
    });

    router.exit({ type: 'exit', id: 'harness1', exitCode: 0 });

    expect(onSessionExit).toHaveBeenCalledWith('harness1', undefined, true);
  });
});
