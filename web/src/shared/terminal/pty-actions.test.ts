import { describe, expect, it, vi } from 'vitest';
import { ptyActions } from './pty-actions';

describe('ptyActions', () => {
  it('delegates attachment and detachment', () => {
    const detach = vi.fn();
    const attachPty = vi.fn(() => detach);
    const actions = ptyActions({ send: vi.fn(), attachPty });
    const onData = vi.fn();
    expect(actions.attach('p1', onData)).toBe(detach);
    expect(attachPty).toHaveBeenCalledWith('p1', onData);
  });

  it('maps terminal actions to their protocol calls', () => {
    const send = vi.fn();
    const actions = ptyActions({ send, attachPty: vi.fn(() => () => {}) });
    actions.input('p1', 'hello');
    actions.resize('p1', 80, 24);
    actions.reportColors('p1', '#fff', '#000');
    actions.kill('p1');
    expect(send.mock.calls).toEqual([
      [{ method: 'ptyInput', params: { id: 'p1', data: 'hello' } }],
      [{ method: 'ptyResize', params: { id: 'p1', cols: 80, rows: 24 } }],
      [{ method: 'reportTerminalColors', params: { id: 'p1', fg: '#fff', bg: '#000' } }],
      [{ method: 'ptyKill', params: { id: 'p1' } }],
    ]);
  });
});
