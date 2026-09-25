import { render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useDialogKeyboard } from './shared/useDialogKeyboard';
import { useCmdW } from './useCmdW';

function TestComponent({ closeTab, active, quitOpen, pickerOpen, routeOpen }: {
  closeTab: (n: number) => void;
  active: number;
  quitOpen: boolean;
  pickerOpen: boolean;
  routeOpen: boolean;
}) {
  const activeTabRef = useRef(active);
  activeTabRef.current = active;
  const quitConfirmOpenRef = useRef(quitOpen);
  quitConfirmOpenRef.current = quitOpen;
  const pickerOpenRef = useRef(pickerOpen);
  pickerOpenRef.current = pickerOpen;
  const routeRef = useRef(routeOpen ? {} : null);
  routeRef.current = routeOpen ? {} : null;
  useCmdW(closeTab, activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef);

  return null;
}

// A modal built on the shared dialog hook, mounted after useCmdW the way a dialog opens over the app.
function Dialog() {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogKeyboard(dialogRef, { escape: vi.fn() });
  return <div ref={dialogRef} tabIndex={-1} />;
}

function renderIdle(closeTab: (n: number) => void) {
  render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} routeOpen={false} />);
}

function dispatchKey(key: string, opts: { metaKey?: boolean; ctrlKey?: boolean } = {}) {
  globalThis.dispatchEvent(
    new KeyboardEvent('keydown', { key, metaKey: opts.metaKey ?? false, ctrlKey: opts.ctrlKey ?? false, bubbles: true }),
  );
}

describe('useCmdW', () => {
  it('calls closeTab with Cmd+W', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} routeOpen={false} />);
    dispatchKey('w', { metaKey: true });
    expect(closeTab).toHaveBeenCalledWith(2);
  });

  it('calls closeTab with Ctrl+W', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} routeOpen={false} />);
    dispatchKey('w', { ctrlKey: true });
    expect(closeTab).toHaveBeenCalledWith(2);
  });

  it('ignores lowercase w without modifier', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} routeOpen={false} />);
    dispatchKey('w');
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('ignores uppercase W without modifier', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} routeOpen={false} />);
    dispatchKey('W');
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('ignores other meta+key combos', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} routeOpen={false} />);
    dispatchKey('s', { metaKey: true });
    dispatchKey('t', { metaKey: true });
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('does nothing while history picker is open', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen routeOpen={false} />);
    dispatchKey('w', { metaKey: true });
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('does nothing while route chooser is open', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} routeOpen />);
    dispatchKey('w', { metaKey: true });
    expect(closeTab).not.toHaveBeenCalled();
  });

  it('does nothing while quit dialog is open', () => {
    const closeTab = vi.fn();
    render(<TestComponent closeTab={closeTab} active={2} quitOpen pickerOpen={false} routeOpen={false} />);
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
      <TestComponent closeTab={closeTab} active={2} quitOpen={false} pickerOpen={false} routeOpen={false} />,
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
      const rRef = useRef(null);
      useCmdW(closeTab, ref, qRef, pRef, rRef);
      return null;
    }
    render(<NullRefComponent />);
    dispatchKey('w', { metaKey: true });
    expect(closeTab).toHaveBeenCalledWith(0);
  });
});
