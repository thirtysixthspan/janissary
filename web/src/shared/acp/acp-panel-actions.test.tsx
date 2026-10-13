import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JanusClient } from '../ws/ws';
import { acpPanelActions } from './acp-panel-actions';
import { useAcpPanelActions } from './useAcpPanelActions';

describe('acpPanelActions', () => {
  it('scopes reset, collapse, and command intents to the panel owner', () => {
    const send = vi.fn();
    const actions = acpPanelActions({ send, attachPty: vi.fn() }, 'docked-shell');

    actions.reset();
    actions.toggleCollapse();
    actions.intents.onOpenFile('notes.md');
    actions.intents.onFocusTab('another-tab');

    expect(send.mock.calls).toEqual([
      [{ method: 'resetAcp', params: { tab: 'docked-shell' } }],
      [{ method: 'toggleCollapse', params: { tab: 'docked-shell' } }],
      [{ method: 'command', params: { text: 'open notes.md', tab: 'docked-shell' } }],
      [{ method: 'focusTab', params: { label: 'another-tab' } }],
    ]);
  });

  it('delegates PTY attachment and actions to its transport', () => {
    const detach = vi.fn();
    const send = vi.fn();
    const attachPty = vi.fn(() => detach);
    const actions = acpPanelActions({ send, attachPty }, 'shell');
    const onData = vi.fn();

    expect(actions.ptyActions.attach('pty-1', onData)).toBe(detach);
    actions.ptyActions.input('pty-1', 'hello');

    expect(attachPty).toHaveBeenCalledWith('pty-1', onData);
    expect(send).toHaveBeenCalledWith({ method: 'ptyInput', params: { id: 'pty-1', data: 'hello' } });
  });

  it('uses the current owner label after the hook rerenders', () => {
    const send = vi.fn();
    const client = { send, attachPty: vi.fn() } as unknown as JanusClient;
    const { result, rerender } = renderHook(
      ({ label }: { label: string }) => useAcpPanelActions(client, label),
      { initialProps: { label: 'first-owner' } },
    );

    result.current.intents.onOpenFile('first.md');
    rerender({ label: 'second-owner' });
    result.current.intents.onOpenFile('second.md');
    result.current.reset();

    expect(send.mock.calls).toEqual([
      [{ method: 'command', params: { text: 'open first.md', tab: 'first-owner' } }],
      [{ method: 'command', params: { text: 'open second.md', tab: 'second-owner' } }],
      [{ method: 'resetAcp', params: { tab: 'second-owner' } }],
    ]);
  });
});
