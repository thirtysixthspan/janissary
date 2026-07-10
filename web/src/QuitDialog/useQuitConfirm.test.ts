import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
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
    const { rerender } = render(React.createElement(TestComponent, {
      runCommand: () => {},
      inputRef,
      onHook: (h) => { hook = h; },
    }));
    expect(hook!.quitConfirmOpen).toBe(false);
    hook!.openQuitConfirm();
    rerender(React.createElement(TestComponent, {
      runCommand: () => {},
      inputRef,
      onHook: (h) => { hook = h; },
    }));
    expect(hook!.quitConfirmOpen).toBe(true);
  });

  it('confirmQuit calls runCommand with "quit" and closes the dialog', () => {
    let hook: ReturnType<typeof useQuitConfirm> | undefined;
    const runCommand = vi.fn();
    const inputRef = createRef<HTMLTextAreaElement>();
    const { rerender } = render(React.createElement(TestComponent, {
      runCommand,
      inputRef,
      onHook: (h) => { hook = h; },
    }));
    hook!.openQuitConfirm();
    rerender(React.createElement(TestComponent, {
      runCommand,
      inputRef,
      onHook: (h) => { hook = h; },
    }));
    expect(hook!.quitConfirmOpen).toBe(true);
    hook!.confirmQuit();
    rerender(React.createElement(TestComponent, {
      runCommand,
      inputRef,
      onHook: (h) => { hook = h; },
    }));
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
    hook!.cancelQuit();
    expect(hook!.quitConfirmOpen).toBe(false);
    expect(focusFn).toHaveBeenCalled();
    raf.mockRestore();
  });
});
