import { describe, expect, it, vi } from 'vitest';
import { handle } from './handler.js';
import type { Controller } from '../controller.js';
import type { ClientMessage, ServerEvent } from '../protocol.js';

// The launch-teardown arms and the terminal-colour report are ingress-validated rather than blindly
// forwarded, so each gets its own controller fake here: a record of what reached the controller, and
// nothing else.
function makeController() {
  return {
    closeHarnessLaunch: vi.fn(),
    closeScheduleLaunch: vi.fn(),
    reportTerminalColors: vi.fn(),
  } as unknown as Controller;
}

function dispatchCall(controller: Controller, id: number, method: string, params: Record<string, unknown>): ServerEvent[] {
  const replies: ServerEvent[] = [];
  handle(controller, { t: 'rpc', id, method, params } as unknown as ClientMessage, (event) => { replies.push(event); });
  return replies;
}

describe('launch teardown methods', () => {
  it('closes the harness launch the client names nothing about', () => {
    const controller = makeController();

    const replies = dispatchCall(controller, 1, 'closeHarnessLaunch', {});

    expect(controller.closeHarnessLaunch).toHaveBeenCalledWith();
    expect(replies).toEqual([{ t: 'rpc-reply', id: 1, result: 'ok' }]);
  });

  it('closes the schedule launch', () => {
    const controller = makeController();

    const replies = dispatchCall(controller, 2, 'closeScheduleLaunch', {});

    expect(controller.closeScheduleLaunch).toHaveBeenCalledWith();
    expect(replies).toEqual([{ t: 'rpc-reply', id: 2, result: 'ok' }]);
  });

  // The client is closing its own half of a launch, so neither arm waits for the child to report back.
  it('acknowledges a teardown even when the controller records nothing', () => {
    const controller = makeController();

    expect(dispatchCall(controller, 3, 'closeHarnessLaunch', {})).toEqual([
      { t: 'rpc-reply', id: 3, result: 'ok' },
    ]);
  });
});

describe('reportTerminalColors', () => {
  const PALETTE = Array.from({ length: 16 }, (_, index) => `#${index.toString(16).padStart(2, '0')}8080`);

  // These two strings end up in a recording's header and are handed to a terminal emulator, so the
  // check is at ingress: a value that is not a plain colour never reaches the controller at all.
  it('forwards a valid pair with the pty id it came from', () => {
    const controller = makeController();

    const replies = dispatchCall(controller, 4, 'reportTerminalColors', { id: 'pty-1', fg: '#fff', bg: '#000' });

    expect(controller.reportTerminalColors).toHaveBeenCalledWith('pty-1', { fg: '#fff', bg: '#000' });
    expect(replies).toEqual([{ t: 'rpc-reply', id: 4, result: 'ok' }]);
  });

  it.each([
    ['a gradient', 'linear-gradient(red, blue)'],
    ['an escape sequence', '[31m'],
    ['a css url', 'url(https://example.com/x)'],
  ])('drops %s rather than forwarding it', (_label, fg) => {
    const controller = makeController();

    const replies = dispatchCall(controller, 5, 'reportTerminalColors', { id: 'pty-1', fg, bg: '#000' });

    expect(controller.reportTerminalColors).not.toHaveBeenCalled();
    expect(replies).toEqual([{ t: 'rpc-reply', id: 5, result: 'ok' }]);
  });

  it('drops the pair when only the background is suspect', () => {
    const controller = makeController();

    dispatchCall(controller, 6, 'reportTerminalColors', { id: 'pty-1', fg: '#fff', bg: 'expression(1)' });

    expect(controller.reportTerminalColors).not.toHaveBeenCalled();
  });

  // Both halves have to be there: a recording header written from one colour and a default for the
  // other would claim a theme the session never ran under.
  it('drops the pair when a colour is absent', () => {
    const controller = makeController();

    const replies = dispatchCall(controller, 7, 'reportTerminalColors', { id: 'pty-1', fg: '#fff' });

    expect(controller.reportTerminalColors).not.toHaveBeenCalled();
    expect(replies).toEqual([{ t: 'rpc-reply', id: 7, result: 'ok' }]);
  });

  it('forwards the short and long hex forms getComputedStyle can return', () => {
    const controller = makeController();

    dispatchCall(controller, 8, 'reportTerminalColors', { id: 'pty-1', fg: '#abc', bg: '#aabbccdd' });

    expect(controller.reportTerminalColors).toHaveBeenCalledWith('pty-1', { fg: '#abc', bg: '#aabbccdd' });
  });

  // A recording whose header carries no palette is replayed against the default 16 colors, whatever
  // theme the session actually ran under, so the palette has to survive the hop through the handler
  // rather than being dropped on the way to the recorder.
  it('forwards the palette so the recording header keeps the theme it ran under', () => {
    const controller = makeController();
    const palette = PALETTE;

    dispatchCall(controller, 9, 'reportTerminalColors', { id: 'pty-1', fg: '#e4e5e7', bg: '#17181b', palette });

    expect(controller.reportTerminalColors).toHaveBeenCalledWith('pty-1', { fg: '#e4e5e7', bg: '#17181b', palette });
  });

  it.each([
    ['a palette of the wrong length', PALETTE.slice(0, 15)],
    ['a palette holding something other than colours', [...PALETTE.slice(0, 15), 'linear-gradient(red, blue)']],
    ['a palette that is not a list', '#fff'],
  ])('drops the pair rather than write %s into the header', (_label, palette) => {
    const controller = makeController();

    dispatchCall(controller, 10, 'reportTerminalColors', { id: 'pty-1', fg: '#fff', bg: '#000', palette });

    expect(controller.reportTerminalColors).not.toHaveBeenCalled();
  });
});