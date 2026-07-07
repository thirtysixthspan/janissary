import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { CloseSaveGuard } from './CloseSaveGuard';

const makeTab = (label: string) =>
  ({ label, dotColor: '#ff0', groupColor: '#fff' }) as never;

describe('CloseSaveGuard', () => {
  it('renders nothing when no save dialog is needed', () => {
    const guardRef = React.createRef<((index: number) => boolean) | null>();
    const editorHandles = React.createRef<Map<string, { isDirty(): boolean; save(): Promise<void> }>>();
    editorHandles.current = new Map();
    const { container } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
        client: { send: vi.fn() } as never,
        guardRef: guardRef as never,
      }),
    );
    expect(container.querySelector('.modal-backdrop')).toBeNull();
  });

  it('guard function returns false for a clean editor', () => {
    const guardRef = React.createRef<((index: number) => boolean) | null>();
    const editorHandles = React.createRef<Map<string, { isDirty(): boolean; save(): Promise<void> }>>();
    const handle = { isDirty: () => false, save: vi.fn() };
    editorHandles.current = new Map([['tab1', handle]]);
    render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
        client: { send: vi.fn() } as never,
        guardRef: guardRef as never,
      }),
    );
    let result: boolean | undefined;
    act(() => {
      result = guardRef.current!(0);
    });
    expect(result).toBe(false);
  });

  it('guard function returns true and opens dialog for a dirty editor', () => {
    const guardRef = React.createRef<((index: number) => boolean) | null>();
    const editorHandles = React.createRef<Map<string, { isDirty(): boolean; save(): Promise<void> }>>();
    const handle = { isDirty: () => true, save: vi.fn() };
    editorHandles.current = new Map([['tab1', handle]]);
    const { getByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
        client: { send: vi.fn() } as never,
        guardRef: guardRef as never,
      }),
    );
    act(() => {
      guardRef.current!(0);
    });
    expect(getByText('Do you want to save changes to this file?')).toBeTruthy();
  });

  it('guard function handles a missing tab gracefully', () => {
    const guardRef = React.createRef<((index: number) => boolean) | null>();
    const editorHandles = React.createRef<Map<string, { isDirty(): boolean; save(): Promise<void> }>>();
    editorHandles.current = new Map();
    render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
        client: { send: vi.fn() } as never,
        guardRef: guardRef as never,
      }),
    );
    let result: boolean | undefined;
    act(() => {
      result = guardRef.current!(99);
    });
    expect(result).toBe(false);
  });

  it('onSave button saves, closes dialog, and sends closeTab', async () => {
    const guardRef = React.createRef<((index: number) => boolean) | null>();
    const editorHandles = React.createRef<Map<string, { isDirty(): boolean; save(): Promise<void> }>>();
    const save = vi.fn().mockResolvedValue(undefined);
    const handle = { isDirty: () => true, save };
    editorHandles.current = new Map([['tab1', handle]]);
    const client = { send: vi.fn() };
    const { getByText, queryByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
        client: client as never,
        guardRef: guardRef as never,
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
    const guardRef = React.createRef<((index: number) => boolean) | null>();
    const editorHandles = React.createRef<Map<string, { isDirty(): boolean; save(): Promise<void> }>>();
    const save = vi.fn();
    const handle = { isDirty: () => true, save };
    editorHandles.current = new Map([['tab1', handle]]);
    const client = { send: vi.fn() };
    const { getByText, queryByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
        client: client as never,
        guardRef: guardRef as never,
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
    const guardRef = React.createRef<((index: number) => boolean) | null>();
    const editorHandles = React.createRef<Map<string, { isDirty(): boolean; save(): Promise<void> }>>();
    const handle = { isDirty: () => true, save: vi.fn() };
    editorHandles.current = new Map([['tab1', handle]]);
    const client = { send: vi.fn() };
    const { getByText, queryByText } = render(
      React.createElement(CloseSaveGuard, {
        tabs: [makeTab('tab1')],
        editorHandles,
        client: client as never,
        guardRef: guardRef as never,
      }),
    );
    act(() => {
      guardRef.current!(0);
    });
    fireEvent.click(getByText('Cancel (Esc)'));
    expect(client.send).not.toHaveBeenCalled();
    expect(queryByText('Do you want to save changes to this file?')).toBeNull();
  });
});
