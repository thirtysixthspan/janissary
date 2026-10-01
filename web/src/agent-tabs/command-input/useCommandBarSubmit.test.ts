import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { useCommandBarSubmit } from './useCommandBarSubmit';
import { installOverlayOpener, registerContributedOverlay } from '../../shared/contributed-overlays';

const published: (() => void)[] = [];
afterEach(() => { while (published.length > 0) published.pop()?.(); });

// Publishes an overlay claiming `command`, with an opener standing in for the host's. The submit chain
// never holds a plugin, it asks the seam — which is what lets it open an overlay without importing
// the plugin layer.
function publishClaiming(command: string) {
  const opened = vi.fn();
  published.push(
    registerContributedOverlay(
      { name: 'fixture', claimsCommandBar: true, render: () => null, onKey: () => {}, onOpen: () => {} },
      { chords: ['ctrl+shift+v'], command },
    ),
    installOverlayOpener(opened),
  );
  return opened;
}
import type { BufferLine, TabView } from '@shared/protocol';
import type { useTranscriptSearch } from '../../shared/search-bar/useTranscriptSearch';

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
  canSearch, lines, search, openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker,
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
  openProfilePicker: () => void;
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
    canSearch, lines, search, openPicker, openThemePicker, openAppThemePicker, openQueue, openTaskPicker, openProfilePicker,
    navOpen, setNavOpen, openTabNavWithQuery, tabs, openQuitConfirm, guardRef, activeTab, runCommand,
  });
  onResult(submit);
  return null;
}

describe('useCommandBarSubmit', () => {
  // A command word a plugin claims is reached through the shared overlay seam rather than named
  // here, so adding a plugin's command adds no line to this chain. `clip` is the first one.
  it('opens a contributed overlay for a command word a plugin claims, instead of dispatching it', () => {
    const opened = publishClaiming('clip');
    const runCommand = vi.fn();
    let submit: ((text: string) => void) | undefined;
    render(React.createElement(TestComponent, {
      canSearch: false, lines: [], search: makeSearch(),
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {}, openProfilePicker: () => {},
      navOpen: false, setNavOpen: () => {}, openTabNavWithQuery: () => {},
      tabs: [makeTab()], openQuitConfirm: () => {}, guardRef: { current: null }, activeTab: 0, runCommand,
      onResult: (s) => { submit = s; },
    }));

    submit!('clip');

    expect(opened).toHaveBeenCalledWith('fixture', null);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('dispatches a command word no plugin claims', () => {
    publishClaiming('hist');
    const runCommand = vi.fn();
    let submit: ((text: string) => void) | undefined;
    render(React.createElement(TestComponent, {
      canSearch: false, lines: [], search: makeSearch(),
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {}, openProfilePicker: () => {},
      navOpen: false, setNavOpen: () => {}, openTabNavWithQuery: () => {},
      tabs: [makeTab()], openQuitConfirm: () => {}, guardRef: { current: null }, activeTab: 0, runCommand,
      onResult: (s) => { submit = s; },
    }));

    submit!('clip');

    expect(runCommand).toHaveBeenCalledWith('clip');
  });

  it('dispatches a command word no plugin claims', () => {
    const runCommand = vi.fn();
    let submit: ((text: string) => void) | undefined;
    render(React.createElement(TestComponent, {
      canSearch: false, lines: [], search: makeSearch(),
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {}, openProfilePicker: () => {},
      navOpen: false, setNavOpen: () => {}, openTabNavWithQuery: () => {},
      tabs: [makeTab()], openQuitConfirm: () => {}, guardRef: { current: null }, activeTab: 0, runCommand,
      onResult: (s) => { submit = s; },
    }));

    submit!('clip');

    expect(runCommand).toHaveBeenCalledWith('clip');
  });

  it('sends "quit" through openQuitConfirm', () => {
    const openQuitConfirm = vi.fn();
    const runCommand = vi.fn();
    let submit: ((text: string) => void) | undefined;
    render(React.createElement(TestComponent, {
      canSearch: false, lines: [], search: makeSearch(),
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {}, openProfilePicker: () => {},
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
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {}, openProfilePicker: () => {},
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
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {}, openProfilePicker: () => {},
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
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {}, openProfilePicker: () => {},
      navOpen: false, setNavOpen: () => {}, openTabNavWithQuery: () => {},
      tabs: [makeTab(), makeTab({ label: 'other' })],
      openQuitConfirm, guardRef: { current: null }, activeTab: 0, runCommand,
      onResult: (s) => { submit = s; },
    }));
    submit!('close');
    expect(openQuitConfirm).not.toHaveBeenCalled();
    expect(runCommand).toHaveBeenCalledWith('close');
  });

  it('opens the profile picker on bare "profile launch" instead of sending a command', () => {
    const openProfilePicker = vi.fn();
    const runCommand = vi.fn();
    let submit: ((text: string) => void) | undefined;
    render(React.createElement(TestComponent, {
      canSearch: false, lines: [], search: makeSearch(),
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {}, openProfilePicker,
      navOpen: false, setNavOpen: () => {}, openTabNavWithQuery: () => {},
      tabs: [makeTab()], openQuitConfirm: () => {}, guardRef: { current: null }, activeTab: 0, runCommand,
      onResult: (s) => { submit = s; },
    }));
    submit!('profile launch');
    expect(openProfilePicker).toHaveBeenCalledTimes(1);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('sends "profile launch <name>" through runCommand, unaffected', () => {
    const openProfilePicker = vi.fn();
    const runCommand = vi.fn();
    let submit: ((text: string) => void) | undefined;
    render(React.createElement(TestComponent, {
      canSearch: false, lines: [], search: makeSearch(),
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {}, openProfilePicker,
      navOpen: false, setNavOpen: () => {}, openTabNavWithQuery: () => {},
      tabs: [makeTab()], openQuitConfirm: () => {}, guardRef: { current: null }, activeTab: 0, runCommand,
      onResult: (s) => { submit = s; },
    }));
    submit!('profile launch demo');
    expect(openProfilePicker).not.toHaveBeenCalled();
    expect(runCommand).toHaveBeenCalledWith('profile launch demo');
  });

  it('sends "exit" through runCommand when multiple tabs exist', () => {
    const openQuitConfirm = vi.fn();
    const runCommand = vi.fn();
    let submit: ((text: string) => void) | undefined;
    render(React.createElement(TestComponent, {
      canSearch: false, lines: [], search: makeSearch(),
      openPicker: () => {}, openThemePicker: () => {}, openAppThemePicker: () => {}, openQueue: () => {}, openTaskPicker: () => {}, openProfilePicker: () => {},
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
