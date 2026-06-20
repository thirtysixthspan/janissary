import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { useMessaging, type Messaging, type MessagingDeps } from './messaging.js';

let messaging: Messaging;

const Harness = ({ deps }: { deps: MessagingDeps }) => {
  messaging = useMessaging(deps);
  return null;
};

const setup = (over: Partial<MessagingDeps> = {}) => {
  const appendLog = vi.fn();
  const appendContext = vi.fn();
  // Default runners complete synchronously.
  const runShell = vi.fn((_label: string, cmd: string, onComplete: (o: string) => void) => onComplete(`ran:${cmd}`));
  const runWindow = vi.fn((_label: string, _text: string, onComplete: () => void) => onComplete());
  const deps: MessagingDeps = {
    hasAgent: () => true,
    agentColor: (label) => (label === 'aslan' ? '#ff0000' : '#00ff00'),
    isInteractive: () => false,
    appendLog,
    appendContext,
    runShell,
    runWindow,
    ...over,
  };
  render(<Harness deps={deps} />);
  return { appendLog, appendContext, runShell, runWindow };
};

describe('useMessaging', () => {
  it('displays informational messages with the sender color and stores them in context', () => {
    const { appendLog, appendContext } = setup();
    messaging.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'standby' });
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'standby', from: 'aslan', fromColor: '#ff0000' });
    expect(appendContext).toHaveBeenCalledWith('bilal', 'aslan: standby');
  });

  it('runs commands in the recipient shell without replying to the sender', () => {
    const { appendLog, appendContext, runShell } = setup();
    messaging.send({ from: 'aslan', to: 'bilal', kind: 'command', text: 'ls -la' });
    expect(runShell).toHaveBeenCalledWith('bilal', 'ls -la', expect.any(Function));
    // command produces no reply: the sender's transcript/context are untouched by us
    expect(appendContext).not.toHaveBeenCalled();
    expect(appendLog).not.toHaveBeenCalled();
  });

  it('processes a request through the recipient window with no reply to the sender', () => {
    const { appendLog, runWindow, runShell } = setup();
    messaging.send({ from: 'aslan', to: 'bilal', kind: 'request', text: 'about' });
    expect(runWindow).toHaveBeenCalledWith('bilal', 'about', expect.any(Function));
    expect(runShell).not.toHaveBeenCalled();
    // nothing is returned to the sender
    expect(appendLog).not.toHaveBeenCalledWith('aslan', expect.anything());
  });

  it('refuses to run interactive commands remotely', () => {
    const { appendLog, runShell } = setup({ isInteractive: () => true });
    messaging.send({ from: 'aslan', to: 'bilal', kind: 'command', text: 'less file' });
    expect(runShell).not.toHaveBeenCalled();
    expect(appendLog).toHaveBeenCalledWith('bilal', expect.objectContaining({
      output: expect.stringContaining('Cannot run interactive command remotely'),
    }));
  });

  it('refuses to send to an unknown agent', () => {
    setup({ hasAgent: () => false });
    expect(messaging.send({ from: 'aslan', to: 'ghost', kind: 'info', text: 'x' })).toBe(false);
  });

  it('drains multiple queued messages one at a time', async () => {
    const { appendLog } = setup();
    messaging.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'one' });
    messaging.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'two' });
    // The first is handled synchronously; the rest drain on subsequent ticks.
    await new Promise((r) => setTimeout(r, 20));
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'one', from: 'aslan', fromColor: '#ff0000' });
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'two', from: 'aslan', fromColor: '#ff0000' });
  });
});
