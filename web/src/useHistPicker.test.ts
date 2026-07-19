import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import React from 'react';
import { useHistPicker } from './useHistPicker';

function TestComponent({
  recent,
  runCommand,
  onHook,
}: {
  recent: string[];
  runCommand: (text: string) => void;
  onHook: (hook: ReturnType<typeof useHistPicker>) => void;
}) {
  const hook = useHistPicker(recent, runCommand);
  onHook(hook);
  return null;
}

describe('useHistPicker', () => {
  it('openPicker sets pickerIndex to the last recent entry and opens the picker', () => {
    let hook: ReturnType<typeof useHistPicker> | undefined;
    const recent = ['cmd1', 'cmd2', 'cmd3'];
    render(React.createElement(TestComponent, {
      recent,
      runCommand: () => {},
      onHook: (h) => { hook = h; },
    }));
    act(() => hook!.openPicker());
    expect(hook!.pickerOpen).toBe(true);
    expect(hook!.pickerIndex).toBe(2);
  });

  it('openPicker handles empty recent list', () => {
    let hook: ReturnType<typeof useHistPicker> | undefined;
    render(React.createElement(TestComponent, {
      recent: [],
      runCommand: () => {},
      onHook: (h) => { hook = h; },
    }));
    act(() => hook!.openPicker());
    expect(hook!.pickerOpen).toBe(true);
    expect(hook!.pickerIndex).toBe(0);
  });

  it('pick calls runCommand and closes the picker', () => {
    let hook: ReturnType<typeof useHistPicker> | undefined;
    const runCommand = vi.fn();
    render(React.createElement(TestComponent, {
      recent: [],
      runCommand,
      onHook: (h) => { hook = h; },
    }));
    act(() => hook!.pick('test-command'));
    expect(runCommand).toHaveBeenCalledWith('test-command');
    expect(hook!.pickerOpen).toBe(false);
  });

  it('setPickerIndex updates the index state', () => {
    let hook: ReturnType<typeof useHistPicker> | undefined;
    render(React.createElement(TestComponent, {
      recent: [],
      runCommand: () => {},
      onHook: (h) => { hook = h; },
    }));
    act(() => hook!.setPickerIndex(5));
    expect(hook!.pickerIndex).toBe(5);
  });
});
