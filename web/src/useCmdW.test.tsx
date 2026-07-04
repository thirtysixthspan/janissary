import { render } from '@testing-library/react';
import React, { useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCmdW } from './useCmdW';

function TestComponent({ closeTab, active, quitOpen, pickerOpen, routeOpen, view }: {
  closeTab: (n: number) => void;
  active: number;
  quitOpen: boolean;
  pickerOpen: boolean;
  routeOpen: boolean;
  view?: string;
}) {
  const activeTabRef = useRef(active);
  activeTabRef.current = active;
  const quitConfirmOpenRef = useRef(quitOpen);
  quitConfirmOpenRef.current = quitOpen;
  const pickerOpenRef = useRef(pickerOpen);
  pickerOpenRef.current = pickerOpen;
  const routeRef = useRef(routeOpen ? {} : null);
  routeRef.current = routeOpen ? {} : null;
  const activeViewRef = useRef(view);
  activeViewRef.current = view;

  useCmdW(closeTab, activeTabRef, quitConfirmOpenRef, pickerOpenRef, routeRef, activeViewRef);

  return null;
}

function dispatchBeforeUnload() {
  // beforeunload events are uncancelable by default, but we dispatch them with
  // cancelable: true so the handler's preventDefault() can be exercised.
  globalThis.dispatchEvent(new Event('beforeunload', { cancelable: true }));
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

  describe('beforeunload fallback (page tab / iframe)', () => {
    it('calls closeTab on beforeunload when view is page', () => {
      const closeTab = vi.fn();
      render(<TestComponent closeTab={closeTab} active={1} quitOpen={false} pickerOpen={false} routeOpen={false} view="page" />);
      dispatchBeforeUnload();
      expect(closeTab).toHaveBeenCalledWith(1);
    });

    it('does nothing on beforeunload when view is not page', () => {
      const closeTab = vi.fn();
      render(<TestComponent closeTab={closeTab} active={1} quitOpen={false} pickerOpen={false} routeOpen={false} view="agent" />);
      dispatchBeforeUnload();
      expect(closeTab).not.toHaveBeenCalled();
    });

    it('does nothing on beforeunload when quit dialog is open', () => {
      const closeTab = vi.fn();
      render(<TestComponent closeTab={closeTab} active={1} quitOpen pickerOpen={false} routeOpen={false} view="page" />);
      dispatchBeforeUnload();
      expect(closeTab).not.toHaveBeenCalled();
    });

    it('does not loop on re-entry', () => {
      const closeTab = vi.fn();
      render(<TestComponent closeTab={closeTab} active={1} quitOpen={false} pickerOpen={false} routeOpen={false} view="page" />);
      // Two beforeunload events in sequence: the second should be guarded by the re-entry flag.
      dispatchBeforeUnload();
      dispatchBeforeUnload();
      expect(closeTab).toHaveBeenCalledTimes(1);
    });
  });
});
