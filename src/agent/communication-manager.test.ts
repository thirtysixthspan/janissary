import { describe, it, expect, vi } from 'vitest';
import { AgentCommunicationManager } from './communication-manager.js';
import type { Tab } from '../tab/types.js';

const makeTab = (label: string, dotColor: string, title?: string): Tab => ({
  label, dotColor, log: [], activePty: undefined, toolStepsExpanded: false,
  cmdHistory: [], cmdHistoryIdx: -1, group: 1, groupColor: dotColor,
  number: 1, scrollOffset: 0, title,
} as Tab);

const setup = () => {
  const append = vi.fn();
  const appendContext = vi.fn();
  const persist = vi.fn();
  const buildAgentState = vi.fn();
  const captureRun = vi.fn((_label: string, _text: string, onResult: (o: string) => void) => onResult('out:about'));
  const tabs: Tab[] = [makeTab('aslan', '#ff0000'), makeTab('bilal', '#00ff00')];
  const managers = {
    tab: { tabs, byLabel: (label: string) => tabs.find((t) => t.label === label), append, appendContext, persist, buildAgentState },
    schedule: { get: vi.fn() },
    capture: { run: captureRun },
  } as never;
  const bus = new AgentCommunicationManager(managers);
  return { bus, append, appendContext, run: captureRun };
};

describe('AgentCommunicationManager', () => {
  it('displays informational messages with the sender color and stores them in context', () => {
    const { bus, append, appendContext } = setup();
    bus.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'standby' });
    expect(append).toHaveBeenCalledWith('bilal', { input: '', output: 'standby', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
    expect(appendContext).toHaveBeenCalledWith('bilal', 'aslan: standby');
  });

  it('runs commands in the recipient shell without replying to the sender', () => {
    const { bus, append, appendContext, run } = setup();
    bus.send({ from: 'aslan', to: 'bilal', kind: 'command', text: 'ls -la' });
    expect(run).toHaveBeenCalledWith('bilal', 'ls -la', expect.any(Function));
    expect(appendContext).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledWith('bilal', { input: '', output: 'sent command: ls -la', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
  });

  it('shows a request in the recipient, executes it, and returns the output as a response', () => {
    const { bus, append, run } = setup();
    bus.send({ from: 'aslan', to: 'bilal', kind: 'request', text: 'about' });
    expect(append).toHaveBeenCalledWith('bilal', { input: '', output: 'sent request: about', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
    expect(run).toHaveBeenCalledWith('bilal', 'about', expect.any(Function));
    expect(append).toHaveBeenCalledWith('aslan', { input: '', output: 'out:about', from: 'response from bilal', fromColor: '#00ff00', msgKind: 'response' });
  });

  it('refuses to send to an unknown agent', () => {
    const { bus } = setup();
    expect(bus.send({ from: 'aslan', to: 'ghost', kind: 'info', text: 'x' })).toBe(false);
  });

  it('routes to a tab by its display alias, keying the recipient by its true label', () => {
    const append = vi.fn();
    const tabs: Tab[] = [makeTab('aslan', '#ff0000'), makeTab('bilal', '#00ff00', 'reviewer')];
    const managers = {
      tab: { tabs, byLabel: (label: string) => tabs.find((t) => t.label === label), append, appendContext: vi.fn(), persist: vi.fn(), buildAgentState: vi.fn() },
      schedule: { get: vi.fn() },
      capture: { run: vi.fn() },
    } as never;
    const bus = new AgentCommunicationManager(managers);
    expect(bus.send({ from: 'aslan', to: 'reviewer', kind: 'info', text: 'standby' })).toBe(true);
    expect(append).toHaveBeenCalledWith('bilal', { input: '', output: 'standby', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
  });

  it('drains multiple queued messages one at a time', async () => {
    const { bus, append } = setup();
    bus.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'one' });
    bus.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'two' });
    await new Promise((r) => setTimeout(r, 20));
    expect(append).toHaveBeenCalledWith('bilal', { input: '', output: 'one', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
    expect(append).toHaveBeenCalledWith('bilal', { input: '', output: 'two', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
  });
});

// A capture that never finishes on its own, the way a shell command waiting on its end sentinel
// never finishes once closing the tab kills the shell. Each run's completion is kept so a test can
// fire it late.
const setupPendingCapture = () => {
  const append = vi.fn();
  const pending: Array<(output: string) => void> = [];
  const tabs: Tab[] = [makeTab('aslan', '#ff0000'), makeTab('bilal', '#00ff00')];
  const managers = {
    tab: { tabs, byLabel: (label: string) => tabs.find((t) => t.label === label), append, appendContext: vi.fn(), persist: vi.fn(), buildAgentState: vi.fn() },
    schedule: { get: vi.fn() },
    capture: { run: vi.fn((_label: string, _text: string, onResult: (o: string) => void) => { pending.push(onResult); }) },
  } as never;
  const bus = new AgentCommunicationManager(managers);
  const reopen = (label: string) => {
    bus.closeTab(label);
    tabs[tabs.findIndex((t) => t.label === label)] = makeTab(label, '#0000ff');
  };
  const info = (output: string) => ({ input: '', output, from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
  const flush = () => new Promise((r) => setTimeout(r, 20));
  return { bus, append, pending, reopen, info, flush };
};

describe('AgentCommunicationManager — tab close', () => {
  it('delivers to a new tab that reuses the label of a tab closed mid-request', () => {
    const { bus, append, reopen, info } = setupPendingCapture();
    bus.send({ from: 'aslan', to: 'bilal', kind: 'request', text: 'sleep 100' });

    reopen('bilal');
    bus.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'hello again' });

    expect(append).toHaveBeenCalledWith('bilal', info('hello again'));
  });

  it('drops messages still queued for the closed tab', async () => {
    const { bus, append, reopen, info, flush } = setupPendingCapture();
    bus.send({ from: 'aslan', to: 'bilal', kind: 'command', text: 'sleep 100' });
    bus.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'stale' });

    reopen('bilal');
    bus.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'fresh' });
    await flush();

    expect(append).toHaveBeenCalledWith('bilal', info('fresh'));
    expect(append).not.toHaveBeenCalledWith('bilal', info('stale'));
  });

  it('ignores a late completion from the closed tab\'s message while the new tab\'s message runs', async () => {
    const { bus, append, pending, reopen, info, flush } = setupPendingCapture();
    bus.send({ from: 'aslan', to: 'bilal', kind: 'command', text: 'first' });

    reopen('bilal');
    bus.send({ from: 'aslan', to: 'bilal', kind: 'command', text: 'second' });
    bus.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'after second' });
    expect(pending).toHaveLength(2);

    pending[0]('late output from the closed tab');
    await flush();
    expect(append).not.toHaveBeenCalledWith('bilal', info('after second'));

    pending[1]('second done');
    await flush();
    expect(append).toHaveBeenCalledWith('bilal', info('after second'));
  });
});
