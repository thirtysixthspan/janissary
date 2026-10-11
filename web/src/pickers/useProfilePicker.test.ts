import { act, render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useProfilePicker } from './useProfilePicker';
import type { JanusClient } from '../shared/ws/ws';

const mockClient = { send: vi.fn(), request: vi.fn() } as unknown as JanusClient;
const profiles = [{ name: 'writing', source: 'project' as const }];

function TestComponent({ onHook, replace = vi.fn() }: {
  onHook: (hook: ReturnType<typeof useProfilePicker>) => void;
  replace?: (text: string) => void;
}) {
  const replacements = useRef(new Map([['shell1', replace]]));
  const hook = useProfilePicker(profiles, 'shell1', { current: replacements.current }, mockClient, undefined);
  onHook(hook);
  return null;
}

describe('useProfilePicker', () => {
  it('openProfilePicker resets the index to the first profile and opens the popup', () => {
    let hook: ReturnType<typeof useProfilePicker> | undefined;
    render(React.createElement(TestComponent, { onHook: (h) => { hook = h; } }));
    act(() => { hook!.setProfilePickerIndex(3); hook!.openProfilePicker(); });
    expect(hook!.profilePickerOpen).toBe(true);
    expect(hook!.profilePickerIndex).toBe(1);
  });

  it('re-seats the index onto a selectable row when a re-render leaves it past the end', () => {
    let hook: ReturnType<typeof useProfilePicker> | undefined;
    function C({ list }: { list: typeof profiles }) {
      hook = useProfilePicker(list, 'shell1', { current: new Map() }, mockClient, undefined);
      return null;
    }
    const three = [...profiles, { name: 'coding', source: 'project' as const }, { name: 'review', source: 'project' as const }];
    const { rerender } = render(React.createElement(C, { list: three }));
    act(() => { hook!.openProfilePicker(); hook!.setProfilePickerIndex(3); });
    expect(hook!.profilePickerIndex).toBe(3);

    rerender(React.createElement(C, { list: profiles }));
    expect(hook!.profilePickerIndex).toBe(1);
    expect(hook!.visibleProfiles[hook!.profilePickerIndex].header).toBeUndefined();
  });

  it('pickProfile populates the command line with profile launch <name> and closes without submitting', () => {
    const replace = vi.fn();
    let hook: ReturnType<typeof useProfilePicker> | undefined;
    function C() {
      hook = useProfilePicker(profiles, 'shell1', { current: new Map([['shell1', replace]]) }, mockClient, undefined);
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openProfilePicker());
    act(() => hook!.pickProfile('writing'));
    expect(replace).toHaveBeenCalledWith('profile launch writing');
    expect(hook!.profilePickerOpen).toBe(false);
  });

  it('pickProfile sends ptyInput to the harness when harnessPtyId is set, instead of the command line', () => {
    const replace = vi.fn();
    const send = vi.fn();
    const client = { send, request: vi.fn() } as unknown as JanusClient;
    let hook: ReturnType<typeof useProfilePicker> | undefined;
    function C() {
      hook = useProfilePicker(profiles, 'shell1', { current: new Map([['shell1', replace]]) }, client, 'pty-1');
      return null;
    }
    render(React.createElement(C));
    act(() => hook!.openProfilePicker());
    act(() => hook!.pickProfile('writing'));
    expect(send).toHaveBeenCalledWith({ method: 'ptyInput', params: { id: 'pty-1', data: 'profile launch writing' } });
    expect(replace).not.toHaveBeenCalled();
    expect(hook!.profilePickerOpen).toBe(false);
  });
});
