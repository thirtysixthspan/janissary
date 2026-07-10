import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { useCommandBarSubmit } from './useCommandBarSubmit';
import type { BufferLine, TabView } from '@shared/protocol';
import type { useTranscriptSearch } from './useTranscriptSearch';

function makeSearch(): ReturnType<typeof useTranscriptSearch> {
  return {
    searchOpen: false, pattern: '', status: 'empty' as const,
    position: null, currentLineIndex: null,
    open: () => {}, close: () => {}, setPattern: () => {}, stepOlder: () => {}, stepNewer: () => {},
  };
}

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'janus', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    ...overrides,
  };
}

function TestComponent({
  canSearch, lines, search, openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker,
  navOpen, setNavOpen, openTabNavWithQuery, tabs, openQuitConfirm, guardRef, activeTab, runCommand,
  onResult,
}: {
  canSearch: boolean;
  lines: BufferLine[];
  search: ReturnType<typeof useTranscriptSearch>;
  openPicker: () => void;
  openThemePicker: () => void;
  openAppThemePicker: () => void;
  openQueue: () => void;
  openTaskPicker: () => void;
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  openTabNavWithQuery: (query: string) => void;
  tabs: TabView[];
  openQuitConfirm: () => void;
  guardRef: { current: ((index: number) => boolean) | null };
  activeTab: number;
  runCommand: (text: string) => void;
  onResult: (submit: (text: string) => void) => void;
}) {
  const submit = useCommandBarSubmit({
    canSearch, lines, search, openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker,
    navOpen, setNavOpen, openTabNavWithQuery, tabs, openQuitConfirm, guardRef, activeTab, runCommand,
  });
  onResult(submit);
  return null;
}

describe('useCommandBarSubmit', () => {
  it('sends "quit" through openQuitConfirm', () => {
    const openQuitConfirm = vi.fn();
    const runCommand = vi.fn();
    let submit: ((text: string) => void) | undefined;
    render(React.createElement(TestComponent, {
      canSearch: false, lines: [], search: makeSearch(),
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {},
      navOpen: false, setNavOpen: () => {}, openTabNavWithQuery: () => {},
      tabs: [makeTab()], openQuitConfirm, guardRef: { current: null }, activeTab: 0, runCommand,
      onResult: (s) => { submit = s; },
    }));
    submit!('quit');
    expect(openQuitConfirm).toHaveBeenCalledTimes(1);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('sends "close" through openQuitConfirm when only one tab exists', () => {
    const openQuitConfirm = vi.fn();
    const runCommand = vi.fn();
    let submit: ((text: string) => void) | undefined;
    render(React.createElement(TestComponent, {
      canSearch: false, lines: [], search: makeSearch(),
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {},
      navOpen: false, setNavOpen: () => {}, openTabNavWithQuery: () => {},
      tabs: [makeTab()], openQuitConfirm, guardRef: { current: null }, activeTab: 0, runCommand,
      onResult: (s) => { submit = s; },
    }));
    submit!('close');
    expect(openQuitConfirm).toHaveBeenCalledTimes(1);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('sends "exit" through openQuitConfirm when only one tab exists', () => {
    const openQuitConfirm = vi.fn();
    const runCommand = vi.fn();
    let submit: ((text: string) => void) | undefined;
    render(React.createElement(TestComponent, {
      canSearch: false, lines: [], search: makeSearch(),
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {},
      navOpen: false, setNavOpen: () => {}, openTabNavWithQuery: () => {},
      tabs: [makeTab()], openQuitConfirm, guardRef: { current: null }, activeTab: 0, runCommand,
      onResult: (s) => { submit = s; },
    }));
    submit!('exit');
    expect(openQuitConfirm).toHaveBeenCalledTimes(1);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('sends "close" through runCommand when multiple tabs exist', () => {
    const openQuitConfirm = vi.fn();
    const runCommand = vi.fn();
    let submit: ((text: string) => void) | undefined;
    render(React.createElement(TestComponent, {
      canSearch: false, lines: [], search: makeSearch(),
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {},
      navOpen: false, setNavOpen: () => {}, openTabNavWithQuery: () => {},
      tabs: [makeTab(), makeTab({ label: 'other' })],
      openQuitConfirm, guardRef: { current: null }, activeTab: 0, runCommand,
      onResult: (s) => { submit = s; },
    }));
    submit!('close');
    expect(openQuitConfirm).not.toHaveBeenCalled();
    expect(runCommand).toHaveBeenCalledWith('close');
  });

  it('sends "exit" through runCommand when multiple tabs exist', () => {
    const openQuitConfirm = vi.fn();
    const runCommand = vi.fn();
    let submit: ((text: string) => void) | undefined;
    render(React.createElement(TestComponent, {
      canSearch: false, lines: [], search: makeSearch(),
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {},
      navOpen: false, setNavOpen: () => {}, openTabNavWithQuery: () => {},
      tabs: [makeTab(), makeTab({ label: 'other' })],
      openQuitConfirm, guardRef: { current: null }, activeTab: 0, runCommand,
      onResult: (s) => { submit = s; },
    }));
    submit!('exit');
    expect(openQuitConfirm).not.toHaveBeenCalled();
    expect(runCommand).toHaveBeenCalledWith('exit');
  });
});
