import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { HarnessTabHandle } from './HarnessTab';
import type { ShellTabHandle } from './ShellTab';
import { useFocusOnTabSwitch } from './useFocusOnTabSwitch';

function refOf<T>(value: T): React.RefObject<T> {
  return { current: value };
}

describe('useFocusOnTabSwitch', () => {
  it('focuses the harness handle for the active tab when it has a harness PTY', () => {
    const focus = vi.fn();
    const harnessHandles = refOf(new Map([['pty-1', { focus } as unknown as HarnessTabHandle]]));
    const shellHandles = refOf(new Map<string, ShellTabHandle>());
    const inputReference = refOf<HTMLTextAreaElement | null>(null);
    const currentRef = refOf<TabView | undefined>({ view: 'harness', harness: { ptyId: 'pty-1' } } as unknown as TabView);

    renderHook(() => useFocusOnTabSwitch(0, currentRef, harnessHandles, shellHandles, inputReference));

    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('focuses the shell handle for the active tab when it has an activePty', () => {
    const focus = vi.fn();
    const harnessHandles = refOf(new Map<string, HarnessTabHandle>());
    const shellHandles = refOf(new Map([['shell-1', { focus } as unknown as ShellTabHandle]]));
    const inputReference = refOf<HTMLTextAreaElement | null>(null);
    const currentRef = refOf<TabView | undefined>({ view: 'agent', activePty: 'shell-1' } as unknown as TabView);

    renderHook(() => useFocusOnTabSwitch(0, currentRef, harnessHandles, shellHandles, inputReference));

    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('focuses the command line for any other tab', () => {
    const focus = vi.fn();
    const harnessHandles = refOf(new Map<string, HarnessTabHandle>());
    const shellHandles = refOf(new Map<string, ShellTabHandle>());
    const inputReference = refOf<HTMLTextAreaElement | null>({ focus } as unknown as HTMLTextAreaElement);
    const currentRef = refOf<TabView | undefined>({ view: 'agent' } as unknown as TabView);

    renderHook(() => useFocusOnTabSwitch(0, currentRef, harnessHandles, shellHandles, inputReference));

    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('re-focuses only when activeTab changes', () => {
    const focus = vi.fn();
    const harnessHandles = refOf(new Map<string, HarnessTabHandle>());
    const shellHandles = refOf(new Map<string, ShellTabHandle>());
    const inputReference = refOf<HTMLTextAreaElement | null>({ focus } as unknown as HTMLTextAreaElement);
    const currentRef = refOf<TabView | undefined>({ view: 'agent' } as unknown as TabView);

    const { rerender } = renderHook(
      ({ activeTab }) => useFocusOnTabSwitch(activeTab, currentRef, harnessHandles, shellHandles, inputReference),
      { initialProps: { activeTab: 0 } },
    );
    expect(focus).toHaveBeenCalledTimes(1);

    rerender({ activeTab: 0 });
    expect(focus).toHaveBeenCalledTimes(1);

    rerender({ activeTab: 1 });
    expect(focus).toHaveBeenCalledTimes(2);
  });
});
