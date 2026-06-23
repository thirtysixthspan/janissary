import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { useMessaging } from './messaging.js';
import type { Messaging, MessagingDeps } from './types.js';

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
  const runCapture = vi.fn((_label: string, text: string, onResult: (o: string) => void) => onResult(`out:${text}`));
  const deps: MessagingDeps = {
    hasAgent: () => true,
    agentColor: (label) => (label === 'aslan' ? '#ff0000' : '#00ff00'),
    isInteractive: () => false,
    appendLog,
    appendContext,
    runShell,
    runCapture,
    ...over,
  };
  render(<Harness deps={deps} />);
  return { appendLog, appendContext, runShell, runCapture };
};

describe('useMessaging', () => {
  it('displays informational messages with the sender color and stores them in context', () => {
    const { appendLog, appendContext } = setup();
    messaging.send({ from: 'aslan', to: 'bilal', kind: 'info', text: 'standby' });
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'standby', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
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

  it('shows a request in the recipient, executes it, and returns the output as a response', () => {
    const { appendLog, runCapture } = setup();
    messaging.send({ from: 'aslan', to: 'bilal', kind: 'request', text: 'about' });
    // recipient displays `● request from aslan: about` (sender's color)
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'about', from: 'aslan', fromColor: '#ff0000', msgKind: 'request' });
    // recipient executes the command, capturing output
    expect(runCapture).toHaveBeenCalledWith('bilal', 'about', expect.any(Function));
    // sender receives the captured output as a response (responder's color)
    expect(appendLog).toHaveBeenCalledWith('aslan', { input: '', output: 'out:about', from: 'bilal', fromColor: '#00ff00', msgKind: 'response' });
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
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'one', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
    expect(appendLog).toHaveBeenCalledWith('bilal', { input: '', output: 'two', from: 'aslan', fromColor: '#ff0000', msgKind: 'info' });
  });
});
