import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import React, { createRef } from 'react';
import { useQuitConfirm } from './useQuitConfirm';

function TestComponent({
  runCommand,
  inputRef,
  onHook,
}: {
  runCommand: (text: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onHook: (hook: ReturnType<typeof useQuitConfirm>) => void;
}) {
  const hook = useQuitConfirm(runCommand, inputRef);
  onHook(hook);
  return null;
}

describe('useQuitConfirm', () => {
  it('openQuitConfirm sets quitConfirmOpen to true', () => {
    let hook: ReturnType<typeof useQuitConfirm> | undefined;
    const inputRef = createRef<HTMLTextAreaElement>();
    render(React.createElement(TestComponent, {
      runCommand: () => {},
      inputRef,
      onHook: (h) => { hook = h; },
    }));
    expect(hook!.quitConfirmOpen).toBe(false);
    act(() => hook!.openQuitConfirm());
    expect(hook!.quitConfirmOpen).toBe(true);
  });

  it('confirmQuit calls runCommand with "quit" and closes the dialog', () => {
    let hook: ReturnType<typeof useQuitConfirm> | undefined;
    const runCommand = vi.fn();
    const inputRef = createRef<HTMLTextAreaElement>();
    render(React.createElement(TestComponent, {
      runCommand,
      inputRef,
      onHook: (h) => { hook = h; },
    }));
    act(() => hook!.openQuitConfirm());
    expect(hook!.quitConfirmOpen).toBe(true);
    act(() => hook!.confirmQuit());
    expect(runCommand).toHaveBeenCalledWith('quit');
    expect(hook!.quitConfirmOpen).toBe(false);
  });

  it('cancelQuit closes the dialog and focuses the input', () => {
    let hook: ReturnType<typeof useQuitConfirm> | undefined;
    const runCommand = vi.fn();
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
    const focusFn = vi.fn();
    const inputRef = { current: { focus: focusFn } } as unknown as React.RefObject<HTMLTextAreaElement | null>;
    render(React.createElement(TestComponent, {
      runCommand,
      inputRef,
      onHook: (h) => { hook = h; },
    }));
    act(() => hook!.cancelQuit());
    expect(hook!.quitConfirmOpen).toBe(false);
    expect(focusFn).toHaveBeenCalled();
    raf.mockRestore();
  });
});
