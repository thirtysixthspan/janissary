import { describe, it, expect, vi } from 'vitest';
import { AgentBus } from './message-bus.js';
import type { AgentBusDeps } from './message-bus.js';

const setup = (over: Partial<AgentBusDeps> = {}) => {
  const appendLog = vi.fn();
  const appendContext = vi.fn();
  const runShell = vi.fn((_label: string, command: string, onComplete: (o: string) => void) => onComplete(`ran:${command}`));
  const runCapture = vi.fn((_label: string, text: string, onResult: (o: string) => void) => onResult(`out:${text}`));
  const dependencies: AgentBusDeps = {
    hasAgent: () => true,
    agentColor: (label) => (label === 'aslan' ? '#ff0000' : '#00ff00'),
    isInteractive: () => false,
    appendLog,
    appendContext,
    runShell,
    runCapture,
    ...over,
  };
  return { bus: new AgentBus(dependencies), appendLog, appendContext, runShell, runCapture };
};

describe('AgentBus', () => {
  it('displays informational messages with the sender color and stores them in context', () => {
    const { bus, appendLog, appendContext } = setup();
    bus.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'standby' });
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'standby', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
    expect(appendContext).toHaveBeenCalledWith('bilal', 'aslan: standby');
  });

  it('runs commands in the recipient shell without replying to the sender', () => {
    const { bus, appendLog, appendContext, runCapture } = setup();
    bus.send({ from: 'aslan', to: 'bilal', kind: 'command', text: 'ls -la' });
    expect(runCapture).toHaveBeenCalledWith('bilal', 'ls -la', expect.any(Function));
    expect(appendContext).not.toHaveBeenCalled();
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'sent command: ls -la', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
  });

  it('shows a request in the recipient, executes it, and returns the output as a response', () => {
    const { bus, appendLog, runCapture } = setup();
    bus.send({ from: 'aslan', to: 'bilal', kind: 'request', text: 'about' });
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'sent request: about', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
    expect(runCapture).toHaveBeenCalledWith('bilal', 'about', expect.any(Function));
    expect(appendLog).toHaveBeenCalledWith('aslan', { input: '', output: 'out:about', from: 'response from bilal', fromColor: '#00ff00', msgKind: 'response' });
  });

  it('delegates interactive commands to runCapture (interactivity checked by the recipient)', () => {
    const { bus, appendLog, runCapture } = setup({ isInteractive: () => true });
    bus.send({ from: 'aslan', to: 'bilal', kind: 'command', text: 'less file' });
    expect(runCapture).toHaveBeenCalledWith('bilal', 'less file', expect.any(Function));
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'sent command: less file', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
  });

  it('refuses to send to an unknown agent', () => {
    const { bus } = setup({ hasAgent: () => false });
    expect(bus.send({ from: 'aslan', to: 'ghost', kind: 'info', text: 'x' })).toBe(false);
  });

  it('drains multiple queued messages one at a time', async () => {
    const { bus, appendLog } = setup();
    bus.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'one' });
    bus.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'two' });
    await new Promise((r) => setTimeout(r, 20));
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'one', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'two', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
  });
});
