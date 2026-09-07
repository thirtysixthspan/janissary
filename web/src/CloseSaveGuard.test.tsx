import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import React from 'react';
import type { DirtyTabHandle } from './tab-handles';
import { CloseSaveGuard } from './CloseSaveGuard';

const makeTab = (label: string) =>
  ({ label, dotColor: '#ff0', groupColor: '#fff' }) as never;

function makeHandles() {
  const ref = React.createRef<Map<string, DirtyTabHandle>>();
  (ref as { current: Map<string, DirtyTabHandle> | null }).current = new Map();
  return ref as React.RefObject<Map<string, DirtyTabHandle>>;
}

function makeHandlesWith(label: string, handle: DirtyTabHandle) {
  const ref = React.createRef<Map<string, DirtyTabHandle>>();
  (ref as { current: Map<string, DirtyTabHandle> | null }).current = new Map([[label, handle]]);
  return ref as React.RefObject<Map<string, DirtyTabHandle>>;
}

function makeGuardRef() {
  return React.createRef<((index: number) => boolean) | null>() as React.RefObject<((index: number) => boolean) | null>;
}

describe('CloseSaveGuard', () => {
  function pendingSave() {
    let resolve = () => {};
    let reject = (_error: Error) => {};
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the client targets ES2023
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
    const deferred = { promise, resolve, reject };
    const first = { isDirty: () => true, save: vi.fn(() => deferred.promise), focus: vi.fn() };
    const second = { isDirty: () => true, save: vi.fn().mockResolvedValue(undefined), focus: vi.fn() };
    const tabHandles = makeHandlesWith('first', first);
    tabHandles.current.set('second', second);
    const guardRef = makeGuardRef();
    const client = { send: vi.fn() };
    const view = render(<CloseSaveGuard tabs={[makeTab('first'), makeTab('second')]}
      tabHandles={tabHandles} guardRef={guardRef} client={client as never} />);
    act(() => { guardRef.current!(0); });
    fireEvent.click(view.getByText('Save (y)'));
    return { ...view, deferred, first, second, guardRef, client };
  }

  it('does not close a tab when a cancelled save completes', async () => {
    const h = pendingSave();
    fireEvent.click(h.getByText('Cancel (Esc)'));
    await act(async () => { h.deferred.resolve(); });
    expect(h.client.send).not.toHaveBeenCalled();
    expect(h.first.focus).toHaveBeenCalledOnce();
    expect(h.queryByRole('alertdialog')).toBeNull();
  });

  it.each(['resolve', 'reject'])('ignores stale %s after cancel and another prompt', async (outcome) => {
    const h = pendingSave();
    fireEvent.click(h.getByText('Cancel (Esc)'));
    act(() => { h.guardRef.current!(1); });
    await act(async () => {
      if (outcome === 'resolve') h.deferred.resolve();
      else h.deferred.reject(new Error('late failure'));
    });
    expect(h.client.send).not.toHaveBeenCalled();
    expect(h.first.focus).toHaveBeenCalledOnce();
    expect(h.second.focus).not.toHaveBeenCalled();
    expect(h.getByRole('alertdialog')).toBeInTheDocument();
    await act(async () => { fireEvent.click(h.getByText('Save (y)')); });
    expect(h.second.save).toHaveBeenCalledOnce();
    expect(h.client.send).toHaveBeenCalledExactlyOnceWith({ method: 'closeTab', params: { index: 1 } });
  });

  it('lets a replacement prompt save before the old save completes', async () => {
    const h = pendingSave();
    act(() => { h.guardRef.current!(1); });
    await act(async () => { fireEvent.click(h.getByText('Save (y)')); });
    await act(async () => { h.deferred.resolve(); });
    expect(h.second.save).toHaveBeenCalledOnce();
    expect(h.client.send).toHaveBeenCalledExactlyOnceWith({ method: 'closeTab', params: { index: 1 } });
  });

  it('submits only one save across repeated button and keyboard actions', async () => {
    const h = pendingSave();
    fireEvent.click(h.getByText('Save (y)'));
    fireEvent.keyDown(document, { key: 'y' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(h.first.save).toHaveBeenCalledOnce();
    expect(h.getByText('Save (y)')).toBeDisabled();
    await act(async () => { h.deferred.resolve(); });
    expect(h.client.send).toHaveBeenCalledExactlyOnceWith({ method: 'closeTab', params: { index: 0 } });
  });

  it('invalidates a pending save when discarded', async () => {
    const h = pendingSave();
    fireEvent.click(h.getByText("Don't Save (n)"));
    await act(async () => { h.deferred.resolve(); });
    expect(h.client.send).toHaveBeenCalledExactlyOnceWith({ method: 'closeTab', params: { index: 0 } });
  });

  it.each(['resolve', 'reject'])('ignores %s after unmount', async (outcome) => {
    const h = pendingSave();
    h.unmount();
    await act(async () => {
      if (outcome === 'resolve') h.deferred.resolve();
      else h.deferred.reject(new Error('late failure'));
    });
    expect(h.client.send).not.toHaveBeenCalled();
    expect(h.first.focus).not.toHaveBeenCalled();
    expect(h.guardRef.current).toBeNull();
  });

  it('renders nothing when no save dialog is needed', () => {
    const guardRef = makeGuardRef();
    const tabHandles = makeHandles();
    const { container } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        tabHandles,
        client: { send: vi.fn() } as never,
        guardRef,
      }),
    );
    expect(container.querySelector('.modal-backdrop')).toBeNull();
  });

  it('guard function returns false for a clean editor', () => {
    const guardRef = makeGuardRef();
    const handle = { isDirty: () => false, save: vi.fn(), focus: vi.fn() } as unknown as DirtyTabHandle;
    const tabHandles = makeHandlesWith('tab1', handle);
    render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        tabHandles,
        client: { send: vi.fn() } as never,
        guardRef,
      }),
    );
    let result: boolean | undefined;
    act(() => {
      result = guardRef.current!(0);
    });
    expect(result).toBe(false);
  });

  it('guard function returns true and opens dialog for a dirty editor', () => {
    const guardRef = makeGuardRef();
    const handle = { isDirty: () => true, save: vi.fn(), focus: vi.fn() } as unknown as DirtyTabHandle;
    const tabHandles = makeHandlesWith('tab1', handle);
    const { getByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        tabHandles,
        client: { send: vi.fn() } as never,
        guardRef,
      }),
    );
    act(() => {
      guardRef.current!(0);
    });
    expect(getByText('Do you want to save changes to this file?')).toBeTruthy();
  });

  it('guard function handles a missing tab gracefully', () => {
    const guardRef = makeGuardRef();
    const tabHandles = makeHandles();
    render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        tabHandles,
        client: { send: vi.fn() } as never,
        guardRef,
      }),
    );
    let result: boolean | undefined;
    act(() => {
      result = guardRef.current!(99);
    });
    expect(result).toBe(false);
  });

  it('onSave button saves, closes dialog, and sends closeTab', async () => {
    const guardRef = makeGuardRef();
    const save = vi.fn().mockResolvedValue(undefined);
    const handle = { isDirty: () => true, save } as unknown as DirtyTabHandle;
    const tabHandles = makeHandlesWith('tab1', handle);
    const client = { send: vi.fn() };
    const { getByText, queryByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        tabHandles,
        client: client as never,
        guardRef,
      }),
    );
    act(() => {
      guardRef.current!(0);
    });
    await act(async () => {
      fireEvent.click(getByText('Save (y)'));
    });
    expect(save).toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 0 } });
    expect(queryByText('Do you want to save changes to this file?')).toBeNull();
  });

  // A save that rejects means the buffer is still unwritten, so the tab has to survive the dialog —
  // closing it here is what discarded the user's work.
  it('onSave keeps the tab when the save rejects, and returns focus to it', async () => {
    const guardRef = makeGuardRef();
    const save = vi.fn().mockRejectedValue(new Error('permission denied'));
    const focus = vi.fn();
    const handle = { isDirty: () => true, save, focus } as unknown as DirtyTabHandle;
    const tabHandles = makeHandlesWith('tab1', handle);
    const client = { send: vi.fn() };
    const { getByText, queryByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        tabHandles,
        client: client as never,
        guardRef,
      }),
    );
    act(() => {
      guardRef.current!(0);
    });
    await act(async () => {
      fireEvent.click(getByText('Save (y)'));
    });
    expect(save).toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
    // Dismissed rather than held open: it is modal, and the error or overwrite prompt the surface
    // raised in its place is only reachable once it is gone.
    expect(queryByText('Do you want to save changes to this file?')).toBeNull();
  });

  it('onDiscard button closes dialog and sends closeTab without saving', () => {
    const guardRef = makeGuardRef();
    const save = vi.fn();
    const handle = { isDirty: () => true, save } as unknown as DirtyTabHandle;
    const tabHandles = makeHandlesWith('tab1', handle);
    const client = { send: vi.fn() };
    const { getByText, queryByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        tabHandles,
        client: client as never,
        guardRef,
      }),
    );
    act(() => {
      guardRef.current!(0);
    });
    fireEvent.click(getByText("Don't Save (n)"));
    expect(save).not.toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 0 } });
    expect(queryByText('Do you want to save changes to this file?')).toBeNull();
  });

  it('onCancel button closes dialog without sending closeTab', () => {
    const guardRef = makeGuardRef();
    const handle = { isDirty: () => true, save: vi.fn(), focus: vi.fn() } as unknown as DirtyTabHandle;
    const tabHandles = makeHandlesWith('tab1', handle);
    const client = { send: vi.fn() };
    const { getByText, queryByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        tabHandles,
        client: client as never,
        guardRef,
      }),
    );
    act(() => {
      guardRef.current!(0);
    });
    fireEvent.click(getByText('Cancel (Esc)'));
    expect(client.send).not.toHaveBeenCalled();
    expect(queryByText('Do you want to save changes to this file?')).toBeNull();
    expect(handle.focus).toHaveBeenCalled();
  });
});

// A plugin tab registers the same three-method handle an editor tab does, so the guard needs no new
// shape to reason about and none of its own code changes for it.
describe('CloseSaveGuard over a plugin tab', () => {
  const pluginTab = () => makeTab('image-1');

  function renderGuard(handle?: DirtyTabHandle) {
    const guardRef = makeGuardRef();
    const client = { send: vi.fn() };
    const tabHandles = handle ? makeHandlesWith('image-1', handle) : makeHandles();
    const view = render(
      React.createElement(CloseSaveGuard, {
        tabs: [pluginTab()], tabHandles, client: client as never, guardRef,
      }),
    );
    return { ...view, client, guardRef };
  }

  it('raises the dialog for a plugin tab whose handle reports unsaved work', () => {
    const handle = { isDirty: () => true, save: vi.fn(), focus: vi.fn() } as unknown as DirtyTabHandle;
    const { getByText, guardRef } = renderGuard(handle);

    let result: boolean | undefined;
    act(() => { result = guardRef.current!(0); });

    expect(result).toBe(true);
    expect(getByText('Do you want to save changes to this file?')).toBeTruthy();
  });

  it('Save writes through the plugin handle and then closes the tab', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const handle = { isDirty: () => true, save, focus: vi.fn() } as unknown as DirtyTabHandle;
    const { getByText, client, guardRef } = renderGuard(handle);
    act(() => { guardRef.current!(0); });

    await act(async () => { fireEvent.click(getByText('Save (y)')); });

    expect(save).toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 0 } });
  });

  it('keeps a plugin tab whose save rejects', async () => {
    const save = vi.fn().mockRejectedValue(new Error('write failed'));
    const focus = vi.fn();
    const handle = { isDirty: () => true, save, focus } as unknown as DirtyTabHandle;
    const { getByText, client, guardRef } = renderGuard(handle);
    act(() => { guardRef.current!(0); });

    await act(async () => { fireEvent.click(getByText('Save (y)')); });

    expect(save).toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
  });

  it("Don't Save closes without saving and Cancel closes nothing", () => {
    const save = vi.fn();
    const focus = vi.fn();
    const handle = { isDirty: () => true, save, focus } as unknown as DirtyTabHandle;
    const discard = renderGuard(handle);
    act(() => { discard.guardRef.current!(0); });
    fireEvent.click(discard.getByText("Don't Save (n)"));
    expect(save).not.toHaveBeenCalled();
    expect(discard.client.send).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 0 } });

    const cancel = renderGuard(handle);
    act(() => { cancel.guardRef.current!(0); });
    fireEvent.click(cancel.getByText('Cancel (Esc)'));
    expect(cancel.client.send).not.toHaveBeenCalled();
    expect(focus).toHaveBeenCalled();
  });

  it.each([
    ['a handle reporting clean', { isDirty: () => false, save: vi.fn(), focus: vi.fn() } as unknown as DirtyTabHandle],
    ['no registered handle', undefined],
  ])('closes a plugin tab with %s immediately', (_label, handle) => {
    const { guardRef } = renderGuard(handle);

    let result: boolean | undefined;
    act(() => { result = guardRef.current!(0); });

    expect(result).toBe(false);
  });
});

// The tab list is server-driven and replaced whole on every change, so it can move while the dialog
// is open or a save is pending — an agent opening a tab, a schedule firing, a monitor's reporting
// tab arriving. Every case above holds it fixed for the whole gesture; these do not.
describe('CloseSaveGuard while the tab list changes underneath it', () => {
  function setup(labels: string[], handles: Record<string, DirtyTabHandle>) {
    const guardRef = makeGuardRef();
    const client = { send: vi.fn() };
    const ref = React.createRef<Map<string, DirtyTabHandle>>();
    (ref as { current: Map<string, DirtyTabHandle> | null }).current = new Map(Object.entries(handles));
    const tabHandles = ref as React.RefObject<Map<string, DirtyTabHandle>>;
    const element = (next: string[]) =>
      React.createElement(CloseSaveGuard, {
        tabs: next.map((label) => makeTab(label)),
        tabHandles,
        client: client as never,
        guardRef,
      });
    const view = render(element(labels));
    const setTabs = (next: string[]) => { view.rerender(element(next)); };
    return { ...view, client, guardRef, setTabs };
  }

  const dirtyHandle = (focus = vi.fn()) =>
    ({ isDirty: () => true, save: vi.fn().mockResolvedValue(undefined), focus }) as unknown as DirtyTabHandle;

  it('saves and closes the tab it asked about after another is inserted before it', async () => {
    const handle = dirtyHandle();
    const { getByText, client, guardRef, setTabs } = setup(['alpha', 'beta'], { beta: handle });
    act(() => { guardRef.current!(1); });

    setTabs(['gamma', 'alpha', 'beta']);
    await act(async () => { fireEvent.click(getByText('Save (y)')); });

    expect(handle.save).toHaveBeenCalled();
    expect(client.send).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 2 } });
  });

  it('discards at the index the tab holds after one before it is removed', () => {
    const handle = dirtyHandle();
    const { getByText, client, guardRef, setTabs } = setup(['alpha', 'beta'], { beta: handle });
    act(() => { guardRef.current!(1); });

    setTabs(['beta']);
    fireEvent.click(getByText("Don't Save (n)"));

    expect(client.send).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 0 } });
  });

  it.each([['Save (y)'], ["Don't Save (n)"]])(
    'sends no close from %s once the tab it asked about is gone',
    async (button) => {
      const handle = dirtyHandle();
      const { getByText, client, guardRef, setTabs } = setup(['alpha', 'beta'], { beta: handle });
      act(() => { guardRef.current!(1); });

      setTabs(['alpha']);
      await act(async () => { fireEvent.click(getByText(button)); });

      expect(client.send).not.toHaveBeenCalled();
    },
  );

  // The list is most likely to have moved by the time an awaited save returns, which is why the
  // index is computed after it rather than carried across it.
  it('closes at the index the tab holds once a deferred save resolves', async () => {
    let shift = () => {};
    const save = vi.fn(async () => { shift(); });
    const handle = { isDirty: () => true, save, focus: vi.fn() } as unknown as DirtyTabHandle;
    const { getByText, client, guardRef, setTabs } = setup(['alpha', 'beta'], { beta: handle });
    shift = () => { setTabs(['gamma', 'alpha', 'beta']); };
    act(() => { guardRef.current!(1); });

    await act(async () => { fireEvent.click(getByText('Save (y)')); });

    expect(client.send).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 2 } });
  });

  it('cancel focuses the tab it asked about, not whatever took its position', () => {
    const betaFocus = vi.fn();
    const alphaFocus = vi.fn();
    const { getByText, client, guardRef, setTabs } = setup(
      ['alpha', 'beta'],
      { alpha: dirtyHandle(alphaFocus), beta: dirtyHandle(betaFocus) },
    );
    act(() => { guardRef.current!(1); });

    setTabs(['beta', 'alpha']);
    fireEvent.click(getByText('Cancel (Esc)'));

    expect(betaFocus).toHaveBeenCalled();
    expect(alphaFocus).not.toHaveBeenCalled();
    expect(client.send).not.toHaveBeenCalled();
  });
});
