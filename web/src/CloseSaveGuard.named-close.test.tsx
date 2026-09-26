import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import React, { useRef } from 'react';
import type { TabView } from '@shared/protocol';
import type { DirtyTabHandle } from './shared/tab/handles';
import { CloseSaveGuard } from './CloseSaveGuard';
import { useCommandBarSubmit } from './agent-tabs/command-input/useCommandBarSubmit';
import type { useTranscriptSearch } from './shared/search-bar/useTranscriptSearch';

// The command bar and the save guard are wired together here the way App wires them, so a typed
// `close <name>` is checked end to end against the guard rather than each half on its own.

const search: ReturnType<typeof useTranscriptSearch> = {
  searchOpen: false, pattern: '', status: 'empty',
  position: null, currentLineIndex: null,
  open: () => {}, close: () => {}, setPattern: () => {}, stepOlder: () => {}, stepNewer: () => {},
};

function makeTab(label: string, overrides: Partial<TabView> = {}): TabView {
  return {
    label, number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    ...overrides,
  };
}

const tabs = [makeTab('janus'), makeTab('image', { view: 'plugin', title: 'alpha.png' })];

function Harness({ handles, client, runCommand, onSubmit }: {
  handles: Map<string, DirtyTabHandle>;
  client: { send: (message: unknown) => void };
  runCommand: (text: string) => void;
  onSubmit: (submit: (text: string) => void) => void;
}) {
  const tabHandles = useRef(handles);
  const guardRef = useRef<((index: number) => boolean) | null>(null);
  const noop = () => {};
  onSubmit(useCommandBarSubmit({
    openPicker: noop, openThemePicker: noop, openAppThemePicker: noop, openQueue: noop, openTaskPicker: noop,
    openProfilePicker: noop, navOpen: false, setNavOpen: noop, openTabNavWithQuery: noop,
    canSearch: false, lines: [], search, tabs, openQuitConfirm: noop, guardRef, activeTab: 0, runCommand,
  }));
  return <CloseSaveGuard tabs={tabs} tabHandles={tabHandles} client={client as never} guardRef={guardRef} />;
}

function setup(dirty: boolean) {
  const handle = { isDirty: () => dirty, save: vi.fn().mockResolvedValue(undefined), focus: vi.fn() };
  const client = { send: vi.fn() };
  const runCommand = vi.fn();
  let submit: (text: string) => void = () => {};
  const view = render(
    <Harness handles={new Map([['image', handle]])} client={client} runCommand={runCommand}
      onSubmit={(s) => { submit = s; }} />,
  );
  return { ...view, handle, client, runCommand, submit: (text: string) => act(() => { submit(text); }) };
}

describe('typing close <name> for a tab with unsaved work', () => {
  it.each(['close alpha.png', 'exit alpha.png', 'close image', 'CLOSE Alpha.PNG'])(
    '%s raises the save-changes dialog instead of closing the tab',
    (typed) => {
      const h = setup(true);
      h.submit(typed);
      expect(h.getByText('Do you want to save changes to this file?')).toBeTruthy();
      expect(h.runCommand).not.toHaveBeenCalled();
      expect(h.client.send).not.toHaveBeenCalled();
    },
  );

  it('closes the named tab by its label after Don\'t Save', () => {
    const h = setup(true);
    h.submit('close alpha.png');
    fireEvent.click(h.getByText("Don't Save (n)"));
    expect(h.client.send).toHaveBeenCalledExactlyOnceWith({ method: 'closeTab', params: { label: 'image' } });
    expect(h.runCommand).not.toHaveBeenCalled();
  });

  it('leaves the tab open after Cancel', () => {
    const h = setup(true);
    h.submit('close alpha.png');
    fireEvent.click(h.getByText('Cancel (Esc)'));
    expect(h.client.send).not.toHaveBeenCalled();
    expect(h.handle.focus).toHaveBeenCalledOnce();
  });

  it('sends close <name> to the server as before when the named tab has nothing unsaved', () => {
    const h = setup(false);
    h.submit('close alpha.png');
    expect(h.queryByText('Do you want to save changes to this file?')).toBeNull();
    expect(h.runCommand).toHaveBeenCalledExactlyOnceWith('close alpha.png');
  });

  it('sends close <name> to the server when no tab has that name', () => {
    const h = setup(true);
    h.submit('close nothing-here');
    expect(h.queryByText('Do you want to save changes to this file?')).toBeNull();
    expect(h.runCommand).toHaveBeenCalledExactlyOnceWith('close nothing-here');
  });
});
