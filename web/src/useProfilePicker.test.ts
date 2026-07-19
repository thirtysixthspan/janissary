import { act, render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useProfilePicker } from './useProfilePicker';
import type { JanusClient } from './ws';

const mockClient = { send: vi.fn(), request: vi.fn() } as unknown as JanusClient;

function TestComponent({ onHook }: { onHook: (hook: ReturnType<typeof useProfilePicker>) => void }) {
  const recallRef = useRef<((text: string) => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hook = useProfilePicker(recallRef, inputRef, mockClient, undefined);
  onHook(hook);
  return null;
}

describe('useProfilePicker', () => {
  it('openProfilePicker resets the index to 0 and opens the popup', () => {
    let hook: ReturnType<typeof useProfilePicker> | undefined;
    render(React.createElement(TestComponent, { onHook: (h) => { hook = h; } }));
    act(() => { hook!.setProfilePickerIndex(3); hook!.openProfilePicker(); });
    expect(hook!.profilePickerOpen).toBe(true);
    expect(hook!.profilePickerIndex).toBe(0);
  });

  it('pickProfile populates the command line with profile launch <name> and closes without submitting', () => {
    const recall = vi.fn();
    let hook: ReturnType<typeof useProfilePicker> | undefined;
    function C() {
      const recallRef = useRef<((text: string) => void) | null>(recall);
      const inputRef = useRef<HTMLTextAreaElement>(null);
      hook = useProfilePicker(recallRef, inputRef, mockClient, undefined);
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openProfilePicker());
    act(() => hook!.pickProfile('writing'));
    expect(recall).toHaveBeenCalledWith('profile launch writing');
    expect(hook!.profilePickerOpen).toBe(false);
  });

  it('pickProfile sends ptyInput to the harness when harnessPtyId is set, instead of the command line', () => {
    const recall = vi.fn();
    const send = vi.fn();
    const client = { send, request: vi.fn() } as unknown as JanusClient;
    let hook: ReturnType<typeof useProfilePicker> | undefined;
    function C() {
      const recallRef = useRef<((text: string) => void) | null>(recall);
      const inputRef = useRef<HTMLTextAreaElement>(null);
      hook = useProfilePicker(recallRef, inputRef, client, 'pty-1');
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openProfilePicker());
    act(() => hook!.pickProfile('writing'));
    expect(send).toHaveBeenCalledWith({ method: 'ptyInput', params: { id: 'pty-1', data: 'profile launch writing' } });
    expect(recall).not.toHaveBeenCalled();
    expect(hook!.profilePickerOpen).toBe(false);
  });
});
