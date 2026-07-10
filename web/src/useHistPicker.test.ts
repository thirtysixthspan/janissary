import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
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
    const { rerender } = render(React.createElement(TestComponent, {
      recent,
      runCommand: () => {},
      onHook: (h) => { hook = h; },
    }));
    hook!.openPicker();
    rerender(React.createElement(TestComponent, {
      recent,
      runCommand: () => {},
      onHook: (h) => { hook = h; },
    }));
    expect(hook!.pickerOpen).toBe(true);
    expect(hook!.pickerIndex).toBe(2);
  });

  it('openPicker handles empty recent list', () => {
    let hook: ReturnType<typeof useHistPicker> | undefined;
    const { rerender } = render(React.createElement(TestComponent, {
      recent: [],
      runCommand: () => {},
      onHook: (h) => { hook = h; },
    }));
    hook!.openPicker();
    rerender(React.createElement(TestComponent, {
      recent: [],
      runCommand: () => {},
      onHook: (h) => { hook = h; },
    }));
    expect(hook!.pickerOpen).toBe(true);
    expect(hook!.pickerIndex).toBe(0);
  });

  it('pick calls runCommand and closes the picker', () => {
    let hook: ReturnType<typeof useHistPicker> | undefined;
    const runCommand = vi.fn();
    const { rerender } = render(React.createElement(TestComponent, {
      recent: [],
      runCommand,
      onHook: (h) => { hook = h; },
    }));
    hook!.pick('test-command');
    rerender(React.createElement(TestComponent, {
      recent: [],
      runCommand,
      onHook: (h) => { hook = h; },
    }));
    expect(runCommand).toHaveBeenCalledWith('test-command');
    expect(hook!.pickerOpen).toBe(false);
  });

  it('setPickerIndex updates the index state', () => {
    let hook: ReturnType<typeof useHistPicker> | undefined;
    const { rerender } = render(React.createElement(TestComponent, {
      recent: [],
      runCommand: () => {},
      onHook: (h) => { hook = h; },
    }));
    hook!.setPickerIndex(5);
    rerender(React.createElement(TestComponent, {
      recent: [],
      runCommand: () => {},
      onHook: (h) => { hook = h; },
    }));
    expect(hook!.pickerIndex).toBe(5);
  });
});
