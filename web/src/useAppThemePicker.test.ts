import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { act } from '@testing-library/react';
import { useAppThemePicker } from './useAppThemePicker';

function TestComponent({
  runCommand, onHook,
}: {
  runCommand: (text: string) => void; onHook: (hook: ReturnType<typeof useAppThemePicker>) => void;
}) {
  const hook = useAppThemePicker(runCommand);
  onHook(hook);
  return null;
}

describe('useAppThemePicker', () => {
  it('mirrors the theme onto <html data-theme>', () => {
    let hook: ReturnType<typeof useAppThemePicker> | undefined;
    render(React.createElement(TestComponent, { runCommand: vi.fn(), onHook: (h) => { hook = h; } }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    act(() => hook!.setTheme('nord'));
    expect(document.documentElement.dataset.theme).toBe('nord');
  });

  it('opens the picker with the active theme selected', () => {
    let hook: ReturnType<typeof useAppThemePicker> | undefined;
    render(React.createElement(TestComponent, { runCommand: vi.fn(), onHook: (h) => { hook = h; } }));
    act(() => hook!.setTheme('dracula'));
    act(() => hook!.openAppThemePicker());
    expect(hook!.appThemePickerOpen).toBe(true);
    expect(hook!.appThemePickerIndex).toBe(5);
  });

  it('picking a theme runs the theme command and closes the picker', () => {
    let hook: ReturnType<typeof useAppThemePicker> | undefined;
    const runCommand = vi.fn();
    render(React.createElement(TestComponent, { runCommand, onHook: (h) => { hook = h; } }));
    act(() => hook!.openAppThemePicker());
    act(() => hook!.pickAppTheme('nord'));
    expect(runCommand).toHaveBeenCalledWith('theme nord');
    expect(hook!.appThemePickerOpen).toBe(false);
  });
});
