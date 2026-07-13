import { describe, it, expect, vi } from 'vitest';
import { AgentCommunicationManager } from './communication-manager.js';
import type { Tab } from '../types.js';

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
    tab: { tabs, append, appendContext, persist, buildAgentState },
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
      tab: { tabs, append, appendContext: vi.fn(), persist: vi.fn(), buildAgentState: vi.fn() },
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
