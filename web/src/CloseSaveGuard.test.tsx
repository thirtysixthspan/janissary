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
