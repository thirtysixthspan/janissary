import { render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useDialogKeyboard } from './shared/useDialogKeyboard';
import { useCmdW } from './useCmdW';
import { useCmdWRefs } from './useCmdWRefs';
import { openContributedOverlay, registerContributedOverlay } from './shared/contributed-overlays';
import type { OverlayOpenState } from './pickers/overlay-registry';

const NO_OVERLAYS: OverlayOpenState = {
  syntaxTheme: false, appTheme: false, quickOpen: false, tabNav: false,
  history: false, queue: false, task: false, profile: false,
};

function TestComponent({ closeTab, active, quitOpen, pickerOpen, focusedIndex }: {
  closeTab: (n: number) => void;
  active: number;
  quitOpen: boolean;
  pickerOpen: boolean;
  focusedIndex?: number;
}) {
  const overlays = { ...NO_OVERLAYS, history: pickerOpen };
  const { activeTabRef, quitConfirmOpenRef, keyboardCapturedRef } = useCmdWRefs(
    active, quitOpen, false, overlays,
  );
  const focusedIndexRef = useRef(focusedIndex);
  focusedIndexRef.current = focusedIndex;
  useCmdW(closeTab, activeTabRef, quitConfirmOpenRef, keyboardCapturedRef, focusedIndexRef);

  return null;
}

// A modal built on the shared dialog hook, mounted after useCmdW the way a dialog opens over the app.
function Dialog() {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogKeyboard(dialogRef, { escape: vi.fn() });
  return <div ref={dialogRef} tabIndex={-1} />;
}

function ContributedOverlayShortcut({ closeTab }: { closeTab: (n: number) => void }) {
  const { activeTabRef, quitConfirmOpenRef, keyboardCapturedRef } = useCmdWRefs(2, false, false, NO_OVERLAYS);
  useCmdW(closeTab, activeTabRef, quitConfirmOpenRef, keyboardCapturedRef);
  return null;
}

function renderIdle(closeTab: (n: number) => void) {
  render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} />);
}

function dispatchKey(key: string, opts: { metaKey?: boolean; ctrlKey?: boolean } = {}) {
  globalThis.dispatchEvent(
    new KeyboardEvent('keydown', { key, metaKey: opts.metaKey ?? false, ctrlKey: opts.ctrlKey ?? false, bubbles: true }),
  );
}

describe('useCmdW', () => {
  it('calls closeTab with Cmd+W', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} />);
    dispatchKey('w', { metaKey: true });
    expect(closeTab).toHaveBeenCalledWith(2);
  });

  it('calls closeTab with Ctrl+W', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} />);
    dispatchKey('w', { ctrlKey: true });
    expect(closeTab).toHaveBeenCalledWith(2);
  });

  it('closes the focused docked shell tab instead of the center tab', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} focusedIndex={5} quitOpen={false} pickerOpen={false} />);
    dispatchKey('w', { metaKey: true });
    expect(closeTab).toHaveBeenCalledWith(5);
  });

  it('ignores lowercase w without modifier', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} />);
    dispatchKey('w');
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('ignores uppercase W without modifier', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} />);
    dispatchKey('W');
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('ignores other meta+key combos', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} />);
    dispatchKey('s', { metaKey: true });
    dispatchKey('t', { metaKey: true });
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('does nothing while history picker is open', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen />);
    dispatchKey('w', { metaKey: true });
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('does nothing while a contributed overlay is open', () => {
    const closeTab = vi.fn();
    const unregister = registerContributedOverlay({
      name: 'clipboard-history', claimsCommandBar: true, render: () => null, onKey: () => {}, onOpen: () => {},
    });
    openContributedOverlay('clipboard-history', null);
    render(<ContributedOverlayShortcut closeTab={closeTab} />);

    dispatchKey('w', { metaKey: true });

    expect(closeTab).not.toHaveBeenCalled();
    unregister();
  });

  it('does nothing while quit dialog is open', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen pickerOpen={false} />);
    dispatchKey('w', { metaKey: true });
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('does nothing while a dialog built on useDialogKeyboard is open', () => {
    const closeTab = vi.fn();
    renderIdle(closeTab);
    render(<Dialog />);
    dispatchKey('w', { metaKey: true });
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('closes the tab again once the dialog has closed', () => {
    const closeTab = vi.fn();
    renderIdle(closeTab);
    const { unmount } = render(<Dialog />);
    unmount();
    dispatchKey('w', { metaKey: true });
    expect(closeTab).toHaveBeenCalledWith(2);
  });

  it('does nothing when an earlier listener already prevented the chord', () => {
    const closeTab = vi.fn();
    renderIdle(closeTab);
    const event = new KeyboardEvent('keydown', { key: 'w', metaKey: true, bubbles: true, cancelable: true });
    event.preventDefault();
    globalThis.dispatchEvent(event);
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('removes listener on unmount', () => {
    const closeTab = vi.fn();
    const { unmount } = render(
      <TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} />,
    );
    unmount();
    dispatchKey('w', { metaKey: true });
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('defaults activeTab to 0 when ref is null', () => {
    const closeTab = vi.fn();
    function NullRefComponent() {
      const ref = useRef<number>(null!);
      const qRef = useRef(false);
      const pRef = useRef(false);
      useCmdW(closeTab, ref, qRef, pRef);
      return null;
    }
    render(<NullRefComponent />);
    dispatchKey('w', { metaKey: true });
    expect(closeTab).toHaveBeenCalledWith(0);
  });
});
