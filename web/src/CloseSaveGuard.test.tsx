import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import React from 'react';
import type { EditorTabHandle } from './EditorTab';
import { CloseSaveGuard } from './CloseSaveGuard';

const makeTab = (label: string) =>
  ({ label, dotColor: '#ff0', groupColor: '#fff' }) as never;

function makeHandles() {
  const ref = React.createRef<Map<string, EditorTabHandle>>();
  (ref as { current: Map<string, EditorTabHandle> | null }).current = new Map();
  return ref as React.RefObject<Map<string, EditorTabHandle>>;
}

function makeHandlesWith(label: string, handle: EditorTabHandle) {
  const ref = React.createRef<Map<string, EditorTabHandle>>();
  (ref as { current: Map<string, EditorTabHandle> | null }).current = new Map([[label, handle]]);
  return ref as React.RefObject<Map<string, EditorTabHandle>>;
}

function makeGuardRef() {
  return React.createRef<((index: number) => boolean) | null>() as React.RefObject<((index: number) => boolean) | null>;
}

describe('CloseSaveGuard', () => {
  it('renders nothing when no save dialog is needed', () => {
    const guardRef = makeGuardRef();
    const editorHandles = makeHandles();
    const { container } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
        client: { send: vi.fn() } as never,
        guardRef,
      }),
    );
    expect(container.querySelector('.modal-backdrop')).toBeNull();
  });

  it('guard function returns false for a clean editor', () => {
    const guardRef = makeGuardRef();
    const handle = { isDirty: () => false, save: vi.fn(), focus: vi.fn() } as unknown as EditorTabHandle;
    const editorHandles = makeHandlesWith('tab1', handle);
    render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
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
    const handle = { isDirty: () => true, save: vi.fn(), focus: vi.fn() } as unknown as EditorTabHandle;
    const editorHandles = makeHandlesWith('tab1', handle);
    const { getByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
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
    const editorHandles = makeHandles();
    render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
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
    const handle = { isDirty: () => true, save } as unknown as EditorTabHandle;
    const editorHandles = makeHandlesWith('tab1', handle);
    const client = { send: vi.fn() };
    const { getByText, queryByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
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
    const handle = { isDirty: () => true, save } as unknown as EditorTabHandle;
    const editorHandles = makeHandlesWith('tab1', handle);
    const client = { send: vi.fn() };
    const { getByText, queryByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
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
    const handle = { isDirty: () => true, save: vi.fn(), focus: vi.fn() } as unknown as EditorTabHandle;
    const editorHandles = makeHandlesWith('tab1', handle);
    const client = { send: vi.fn() };
    const { getByText, queryByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
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
