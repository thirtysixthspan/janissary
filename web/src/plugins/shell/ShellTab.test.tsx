import React, { type ReactNode } from 'react';
import { readFileSync } from 'node:fs';
import { act, cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ShellPayload } from '@shared/plugins/shell/shared';
import type { TabView } from '@shared/protocol';
import type { PluginTerminal, TabPluginClientCapabilities } from '../api';
import { PluginChordProvider, createPluginChordRegistry, type PluginChordRegistry } from '../PluginChords';
import { AppCommandBarProvider, useAppCommandLine } from '../../shared/command-bar/AppCommandBar';
import type { PluginCommandLineInsertions } from '../../shared/command-bar/AppCommandBar';
import { ShellTab } from './ShellTab';
import { useSectionNav } from '../../useSectionNav';
import type { createShellMarkerNonce, shellStatusHooks } from './shell-status-hooks';

type ShellStatusHooksModule = {
  createShellMarkerNonce: typeof createShellMarkerNonce;
  shellStatusHooks: typeof shellStatusHooks;
};

// The emulator and its fit addon are stubbed so the tab's own logic — routing, focus, the chord claim —
// is what is under test rather than xterm.js's renderer, which jsdom cannot run. The stub records what
// it was handed, so a resize or a teardown assertion still has something to look at.
const terminals: FakeTerminal[] = [];
const commandStateHandlers: { id: number; handle: (data: string) => boolean }[] = [];

interface FakeTerminal {
  written: string[];
  disposed: boolean;
  options: Record<string, unknown>;
  resizes: { cols: number; rows: number }[];
  focusCalls: number;
  scrollCalls: number[];
  bottomCalls: number;
}

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    written: string[] = [];
    disposed = false;
    resizes: { cols: number; rows: number }[] = [];
    focusCalls = 0;
    scrollCalls: number[] = [];
    bottomCalls = 0;
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      this.options = options;
      terminals.push(this as unknown as FakeTerminal);
    }

    loadAddon() {}
    open() {}
    dispose() { this.disposed = true; }
    write(data: string) { this.written.push(data); }
    hasSelection() { return false; }
    getSelection() { return ''; }
    clearSelection() {}
    attachCustomKeyEventHandler() {}
    onData() { return { dispose: () => {} }; }
    parser = {
      registerOscHandler: (id: number, handler: (data: string) => boolean) => {
        commandStateHandlers.push({ id, handle: handler });
        return { dispose: () => {} };
      },
    };
    focus() { this.focusCalls += 1; }
    scrollLines(amount: number) { this.scrollCalls.push(amount); }
    scrollToBottom() { this.bottomCalls += 1; }
    get cols() { return 100; }
    get rows() { return 30; }
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class { fit() {} activate() {} dispose() {} },
}));

// A fixed nonce, so the markers these tests feed are signed exactly as the installed hooks would sign
// them. `useShellTerminal.test.ts` covers the nonce itself and the markers that lack it.
vi.mock('./shell-status-hooks', async (importOriginal) => ({
  ...await importOriginal<ShellStatusHooksModule>(),
  createShellMarkerNonce: () => 'n0nce',
}));
const NONCE = 'n0nce';

// jsdom has no ResizeObserver, and the terminal registers one. Stubbed rather than installed globally
// so nothing else in the suite can see it.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

const PAYLOAD: ShellPayload = {
  instanceKey: 'shell-1', ptyId: 'pty7', cwd: '/repo', root: '/repo', workspace: false, cols: 80, rows: 24,
  connections: [], schedule: [],
};

type Written = string[];

// `Promise.withResolvers` (ES2024) predates this project's `lib` target; a small typed shim keeps
// the tests off the disallowed "extract resolver from `new Promise()`" pattern regardless.
function withResolvers<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  const state = { resolve: undefined as unknown as (value: T) => void };
  const promise = new Promise<T>((resolve) => { state.resolve = resolve; });
  return { promise, resolve: state.resolve };
}

function makeCapabilities(overrides: {
  active?: boolean;
  dispatched?: boolean;
  output?: string;
  completions?: { matches: string[]; newInput: string; newCursor: number };
  status?: { running: boolean };
  claimedChords?: readonly string[];
  label?: string;
  dotColor?: string;
} = {}) {
  const written: Written = [];
  const resized: { cols: number; rows: number }[] = [];
  const closed: number[] = [];
  const handle: PluginTerminal = {
    write: (data) => {
      if (!data.startsWith("export PROMPT='> '")) written.push(data);
    },
    resize: (cols, rows) => { resized.push({ cols, rows }); },
    onExit: vi.fn(),
    detach: vi.fn(),
  };
  const attachTerminal = vi.fn((_ptyId: string, _onData: (data: string) => void) => handle);
  // The dispatch answer is held until the test releases it, so an assertion can be made *after* the
  // line has been dealt with rather than in the same tick the request was made — asserting an array
  // that starts empty inside `waitFor` passes whether or not the code ever writes to it.
  const { promise: answered, resolve: answerDispatch } = withResolvers<void>();
  const capabilities = {
    resourceUrl: (reference: string) => reference,
    intent: vi.fn(async (name: string, payload?: unknown) => {
      if (name === 'install-hooks') return { install: true, nonce: payload };
      if (name === 'terminal-status') return overrides.status ?? { running: true };
      if (name === 'dispatch') {
        await answered;
        return { dispatched: overrides.dispatched ?? false, output: overrides.output ?? '' };
      }
      if (name === 'complete') {
        return overrides.completions ?? { matches: [], newInput: '', newCursor: 0 };
      }
      return {};
    }) as TabPluginClientCapabilities['intent'],
    copyText: vi.fn(),
    splitAction: null,
    active: overrides.active ?? true,
    dock: null,
    close: vi.fn(() => { closed.push(1); }),
    attachTerminal,
    openFileNavigator: vi.fn(),
    launchAgentHere: vi.fn(),
    reportFailure: vi.fn(),
    // What the host accepted at activation and put on this tab's view — the shell manifest claims
    // `ctrl+r` and `meta+t`, so that is the default here too.
    claimedChords: overrides.claimedChords ?? ['ctrl+r', 'meta+t'],
    dotColor: overrides.dotColor,
    label: overrides.label ?? 'shell1',
  } as unknown as TabPluginClientCapabilities;
  return {
    capabilities, closed, handle, resized, written,
    releaseDispatch: () => { answerDispatch(); },
  };
}

// The application state a plugin tab's bar reaches in the running application: the interception every
// command bar runs, plus the chord registry. Built here through the same hook `App.tsx` uses, so the
// cases below exercise the real classification rather than a stand-in that always answers "not
// intercepted" and would pass whatever the tab did.
type AppBarOptions = {
  tabs?: TabView[];
  activeTab?: number;
  guard?: (index: number) => boolean;
  ghostHistory?: string[];
  blockingOverlayOpen?: boolean;
  overlayOwnsCommandBar?: boolean;
  queueOpen?: boolean;
  queueIndex?: number;
  queueItems?: string[];
  onEditQueued?: (text: string) => void;
  onDeleteQueued?: () => void;
  pluginCommandLineInsertions?: PluginCommandLineInsertions;
  onFocusTab?: (label: string | undefined) => void;
};

type AppBarOpeners = Record<
  'openPicker' | 'openThemePicker' | 'openAppThemePicker' | 'openQueue' | 'openTaskPicker' | 'openProfilePicker'
  | 'openTabNavWithQuery',
  () => void
>;

function tab(label: string): TabView {
  return { label, number: 1, group: 0, busy: false, hasUnread: false } as unknown as TabView;
}

function AppBar({ chords, options, openQuitConfirm, openers, children }: {
  chords: PluginChordRegistry;
  options: AppBarOptions;
  openQuitConfirm: () => void;
  openers: AppBarOpeners;
  children: ReactNode;
}) {
  const intercept = useAppCommandLine({
    ...openers,
    navOpen: false, setNavOpen: () => {},
    tabs: options.tabs ?? [tab('shell1')],
    activeTab: options.activeTab ?? 0,
    openQuitConfirm,
    guardRef: { current: options.guard ?? null },
  });
  return (
    <PluginChordProvider registry={chords}>
      <AppCommandBarProvider bar={{
        intercept,
        ghostHistory: options.ghostHistory ?? [],
        blockingOverlayOpen: options.blockingOverlayOpen,
        overlayOwnsCommandBar: options.overlayOwnsCommandBar,
        onFocusTab: options.onFocusTab,
        queueOpen: options.queueOpen,
        queueIndex: options.queueIndex,
        queueItems: options.queueItems,
        onEditQueued: options.onEditQueued,
        onDeleteQueued: options.onDeleteQueued,
        pluginCommandLineInsertions: options.pluginCommandLineInsertions,
      }}>{children}</AppCommandBarProvider>
    </PluginChordProvider>
  );
}

function mountShell(
  payload: ShellPayload,
  capabilities: TabPluginClientCapabilities,
  options: AppBarOptions = {},
) {
  const chords = createPluginChordRegistry();
  const openQuitConfirm = vi.fn();
  // Spies rather than no-ops, so a case can tell which overlay a bare word opened rather than only that
  // the line was intercepted.
  const openers: AppBarOpeners = {
    openPicker: vi.fn(), openThemePicker: vi.fn(), openAppThemePicker: vi.fn(),
    openQueue: vi.fn(), openTaskPicker: vi.fn(), openProfilePicker: vi.fn(), openTabNavWithQuery: vi.fn(),
  };
  const renderShell = (nextPayload = payload, nextCapabilities = capabilities) => (
    <AppBar chords={chords} options={options} openQuitConfirm={openQuitConfirm} openers={openers}>
      <ShellTab payload={nextPayload} capabilities={nextCapabilities} />
    </AppBar>
  );
  const view = render(renderShell());
  return {
    chords, openQuitConfirm, openers, ...view,
    rerenderShell: (nextPayload = payload, nextCapabilities = capabilities) => {
      view.rerender(renderShell(nextPayload, nextCapabilities));
    },
  };
}

function renderTab(options: Parameters<typeof makeCapabilities>[0] & AppBarOptions = {}) {
  const made = makeCapabilities(options);
  const view = mountShell(PAYLOAD, made.capabilities, options);
  return { ...made, ...view, terminal: terminals.at(-1)! };
}

function bar(): HTMLTextAreaElement {
  return screen.getByLabelText('Shell command') as HTMLTextAreaElement;
}

describe('ShellTab', () => {
  it('reports its focused command bar to the application', () => {
    const onFocusTab = vi.fn();
    renderTab({ onFocusTab });
    fireEvent.focus(bar());
    expect(onFocusTab).toHaveBeenCalledWith('shell1');
    fireEvent.blur(bar());
    expect(onFocusTab).toHaveBeenLastCalledWith(undefined);
  });

  it('seats clipboard and shell history on top of the command bar at its measured height', () => {
    const styles = readFileSync('web/src/plugins/shell/shell.css', 'utf8');
    expect(styles).toContain('.shell-tab .picker.clipboard-history { bottom: var(--command-bar-height, 0px); max-height: 50%; }');
    expect(styles).toContain('.shell-tab .picker.shell-history { bottom: var(--command-bar-height, 0px); max-height: 50%; }');
  });

  it('disables shell input while Quick Open is visible', () => {
    renderTab({ blockingOverlayOpen: true });
    expect(bar()).toBeDisabled();
  });

  it('leaves application overlay keys to the window handler', () => {
    const { capabilities } = renderTab({ overlayOwnsCommandBar: true });
    fireEvent.keyDown(bar(), { key: 'Tab' });
    expect(capabilities.intent).not.toHaveBeenCalledWith('complete', expect.anything());
  });

  it('moves focus between the command bar and terminal with Shift+Tab', () => {
    renderTab();
    const terminal = terminals.at(-1)!;

    expect(fireEvent.keyDown(bar(), { key: 'Tab', shiftKey: true })).toBe(false);
    expect(terminal.focusCalls).toBe(1);

    expect(fireEvent.keyDown(document.querySelector('.shell-body')!, { key: 'Tab', shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(bar());
  });

  it('keeps Shift+Tab from the application\'s section cycling, which listens ahead of it', () => {
    const focusCenter = vi.fn();
    function SectionNav() {
      useSectionNav([tab('shell1')], focusCenter);
      return null;
    }
    render(<SectionNav />);
    renderTab();
    const terminal = terminals.at(-1)!;

    fireEvent.keyDown(bar(), { key: 'Tab', shiftKey: true });
    expect(terminal.focusCalls).toBe(1);

    fireEvent.keyDown(document.querySelector('.shell-body')!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(bar());
    expect(focusCenter).not.toHaveBeenCalled();
  });

  it('loads the selected queued command into its own bar and edits that queue entry', () => {
    const onEditQueued = vi.fn();
    renderTab({ queueOpen: true, queueItems: ['next command', 'later command'], onEditQueued });

    expect(bar()).toHaveValue('next command');
    fireEvent.change(bar(), { target: { value: 'edited command' } });

    expect(onEditQueued).toHaveBeenCalledWith('edited command');
  });

  it('deletes the selected queue entry when Backspace is pressed on an empty line', () => {
    const onDeleteQueued = vi.fn();
    renderTab({ queueOpen: true, queueItems: ['next command'], onDeleteQueued });

    fireEvent.change(bar(), { target: { value: '' } });
    fireEvent.keyDown(bar(), { key: 'Backspace' });

    expect(onDeleteQueued).toHaveBeenCalledOnce();
    expect(bar()).toHaveValue('');
  });

  it('does not submit the selected queue line when Return is pressed', () => {
    const { written } = renderTab({ queueOpen: true, queueItems: ['next command'] });

    fireEvent.keyDown(bar(), { key: 'Enter' });

    expect(written).toEqual([]);
  });

  it('registers task insertion at its own caret without submitting to the shell', () => {
    const pluginCommandLineInsertions: PluginCommandLineInsertions = { current: new Map() };
    const { written } = renderTab({ pluginCommandLineInsertions });
    fireEvent.change(bar(), { target: { value: 'echo done' } });
    bar().setSelectionRange(5, 5);

    act(() => { pluginCommandLineInsertions.current.get('shell1')?.('execute ./ai/tasks/build.md'); });

    expect(bar()).toHaveValue('echo execute ./ai/tasks/build.mddone');
    expect(written).toEqual([]);
  });

  it('uses the tab dot color for the command bar dot', () => {
    const { container } = renderTab({ dotColor: 'rgb(12, 34, 56)' });
    expect(container.querySelector(':scope .command-area .dot')).toHaveStyle({ color: 'rgb(12, 34, 56)' });
  });

  it('blinks the command bar dot while zsh is executing a command', () => {
    const { capabilities } = renderTab();
    act(() => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`C;${NONCE}`); });

    expect(document.querySelector('.command-area .dot')).toHaveClass('busy');
    expect(capabilities.intent).toHaveBeenCalledWith('command-state', { running: true });
  });

  it('reads queue on its command line while zsh is executing a command', () => {
    renderTab();
    expect(document.querySelector('.command-area .command')).not.toHaveTextContent('queue');

    act(() => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`C;${NONCE}`); });

    expect(document.querySelector('.command-area .command')).toHaveTextContent('queue');
  });

  it('queues a line submitted while zsh is busy and runs it when zsh returns to its prompt', async () => {
    const queued: string[] = [];
    const { capabilities, releaseDispatch, written } = renderTab({ dispatched: false });
    const intent = capabilities.intent as unknown as {
      getMockImplementation: () => (name: string, payload: unknown) => unknown;
      mockImplementation: (fn: (name: string, payload: unknown) => unknown) => void;
    };
    const answer = intent.getMockImplementation();
    intent.mockImplementation(async (name, payload) => {
      if (name === 'queue') { queued.push(payload as string); return { queued: true }; }
      if (name === 'dequeue') return { line: queued.shift() ?? null };
      return answer(name, payload);
    });
    act(() => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`C;${NONCE}`); });

    fireEvent.change(bar(), { target: { value: '!ls -la' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });

    await waitFor(() => { expect(queued).toEqual(['!ls -la']); });
    expect(written).toEqual([]);
    expect(bar().value).toBe('');

    await act(async () => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`D;${NONCE}`); });
    releaseDispatch();

    await waitFor(() => { expect(written).toEqual(['ls -la\n']); });
    expect(queued).toEqual([]);
    fireEvent.keyDown(bar(), { key: 'ArrowUp' });
    expect(bar().value).toBe('!ls -la');
  });

  it('queues a second line submitted before zsh reports the first one as running', async () => {
    const queued: string[] = [];
    const { capabilities, written } = renderTab();
    const intent = capabilities.intent as unknown as {
      getMockImplementation: () => (name: string, payload: unknown) => unknown;
      mockImplementation: (fn: (name: string, payload: unknown) => unknown) => void;
    };
    const answer = intent.getMockImplementation();
    intent.mockImplementation(async (name, payload) => {
      if (name === 'queue') { queued.push(payload as string); return { queued: true }; }
      if (name === 'dequeue') return { line: queued.shift() ?? null };
      return answer(name, payload);
    });

    fireEvent.change(bar(), { target: { value: '!ssh host' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    fireEvent.change(bar(), { target: { value: '!ls' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });

    await waitFor(() => { expect(queued).toEqual(['!ls']); });
    expect(written).toEqual(['ssh host\n']);

    act(() => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`C;${NONCE}`); });
    await act(async () => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`D;${NONCE}`); });

    await waitFor(() => { expect(written).toEqual(['ssh host\n', 'ls\n']); });
    expect(queued).toEqual([]);
  });

  it('sends the current directory from zsh to the plugin intent', () => {
    const { capabilities } = renderTab();

    act(() => { commandStateHandlers.findLast(({ id }) => id === 7)?.handle(`${NONCE};${btoa('/work/child dir')}`); });

    expect(capabilities.intent).toHaveBeenCalledWith('cwd', '/work/child dir');
  });
  it('opens a sibling shell when the host spends its Cmd+T claim, without opening its history', () => {
    const { capabilities, chords, written } = renderTab();

    expect(chords.run('meta+t', 'shell1')).toBe(true);

    expect(capabilities.intent).toHaveBeenCalledWith('dispatch', 'zsh');
    expect(document.querySelector('.shell-history')).toBeNull();
    expect(written).toEqual([]);
  });

  // The bar answering Cmd+T itself was a second path that only worked with the bar focused. Leaving
  // the key alone is what lets the window handler spend the claim from the terminal and the bar alike.
  it('leaves Cmd+T in the command bar to the window handler and its claim', () => {
    const { capabilities } = renderTab();

    const handled = !fireEvent.keyDown(bar(), { key: 't', metaKey: true });

    expect(handled).toBe(false);
    expect(capabilities.intent).not.toHaveBeenCalledWith('dispatch', 'zsh');
  });

  it('renders the working directory in the metadata row', () => {
    renderTab();

    expect(screen.getByText('$root/')).toBeInTheDocument();
  });

  it('renders a workspace cwd with its workspace shortcut', () => {
    mountShell({
      ...PAYLOAD,
      cwd: '/repo/.janissary/workspace/alex/src',
      workspace: true,
      workspaceDir: '/repo/.janissary/workspace/alex',
    }, makeCapabilities().capabilities);

    expect(screen.getByText('$workspace/alex/src')).toBeInTheDocument();
  });

  it('scrolls the active xterm terminal with transcript navigation keys', () => {
    renderTab();

    fireEvent.keyDown(document.body, { key: 'PageUp' });
    fireEvent.keyDown(document.body, { key: 'ArrowDown', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'Escape' });

    expect(terminals.at(-1)?.scrollCalls).toEqual([-15, 1]);
    expect(terminals.at(-1)?.bottomCalls).toBe(1);
  });

  it('leaves scroll keys alone while inactive or while an application overlay owns input', () => {
    renderTab({ active: false });
    fireEvent.keyDown(document.body, { key: 'PageDown' });
    expect(terminals.at(-1)?.scrollCalls).toEqual([]);
    cleanup();

    renderTab({ overlayOwnsCommandBar: true });
    fireEvent.keyDown(document.body, { key: 'PageDown' });
    expect(terminals.at(-1)?.scrollCalls).toEqual([]);
  });

  it('marks the row as workspaced only when the shell started in a workspace', () => {
    const { unmount } = renderTab();
    expect(screen.queryByLabelText('Workspaced')).not.toBeInTheDocument();
    unmount();

    mountShell({ ...PAYLOAD, workspace: true }, makeCapabilities().capabilities);
    expect(screen.getByLabelText('Workspaced')).toBeInTheDocument();
  });

  it('opens a file navigator and sibling shell from its own row buttons', async () => {
    const { capabilities, releaseDispatch } = renderTab({ dispatched: true });

    fireEvent.click(screen.getByTitle('Open file navigator here'));
    fireEvent.click(screen.getByTitle('New shell here'));

    expect(capabilities.openFileNavigator).toHaveBeenCalledTimes(1);
    expect(capabilities.intent).toHaveBeenCalledWith('dispatch', 'zsh');
    await act(async () => { releaseDispatch(); });
    expect(capabilities.reportFailure).not.toHaveBeenCalled();
  });

  it('gives each of its own row buttons a glyph, so the control has a size and can be pressed', () => {
    renderTab();

    // A `{ prefix, iconName }` descriptor carries no path data, so `FontAwesomeIcon` resolves it
    // against a library the plugin cannot add to — and an unregistered name renders nothing at all.
    // The button then collapses to its own padding: present, zero-height, and impossible to click.
    for (const selector of ['.tab-open-files', '.tab-launch-agent']) {
      const button = document.querySelector(`.shell-tab ${selector}`);
      expect(button, `${selector} is missing`).not.toBeNull();
      expect(button?.querySelector('svg'), `${selector} has no glyph`).not.toBeNull();
    }
  });

  it('renders no transcript control, because the terminal replaced the transcript', () => {
    renderTab();

    expect(document.querySelector('.tab-open-transcript')).toBeNull();
  });

  it('offers the two status-window buttons, without which the windows it renders are unreachable', () => {
    mountShell({ ...PAYLOAD, connections: [{ text: 'zsh', kind: 'terminal' }] }, makeCapabilities().capabilities);

    // The host pushes connection and schedule rows into this payload on every change. Rendering the
    // panels without the controls that open them computes rows nothing can ever show.
    expect(document.querySelector('.tab-meta .tab-connections')).not.toBeNull();
    expect(document.querySelector('.tab-meta .tab-schedule')).not.toBeNull();
    // The connections button has a row to show, so it offers its window; the schedule button has none
    // and says so, which is the same pair of states an agent tab's row is in.
    expect(screen.getByTitle('connections')).toBeInTheDocument();
    expect(screen.getByTitle('no active schedules')).toBeInTheDocument();
  });

  it('says the connections window is empty when the tab has no connections yet', () => {
    renderTab();

    expect(screen.getByTitle('no active connections')).toBeInTheDocument();
  });

  it('renders the host\'s own connections window from the pushed rows', () => {
    mountShell({ ...PAYLOAD, connections: [{ text: 'zsh', kind: 'terminal' }] }, makeCapabilities().capabilities);

    // The panel auto-shows for five seconds on activation, which is the host's own behavior rather
    // than anything this plugin does with it.
    expect(screen.getByText('connections')).toBeInTheDocument();
    expect(screen.getByText('zsh')).toBeInTheDocument();
    expect(document.querySelector('.shell-tab-header .tab-meta')).not.toBeNull();
    expect(document.querySelector('.shell-tab-header .status-panels')).not.toBeNull();
    const styles = readFileSync('web/src/plugins/shell/shell.css', 'utf8');
    expect(styles).toContain('.shell-tab-header .status-panels { top: 100%; right: 10px; }');
  });

  it('sends a line the host does not claim to the shell', async () => {
    const { releaseDispatch, written } = renderTab({ dispatched: false });

    fireEvent.change(bar(), { target: { value: 'ls -la' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    releaseDispatch();

    await waitFor(() => { expect(written).toEqual(['ls -la\n']); });
  });

  it('sends a multi-line bar command as one bracketed paste to the shell', async () => {
    const { written } = renderTab();
    const command = '!for f in *; do\n  echo "$f"\ndone';

    fireEvent.change(bar(), { target: { value: command } });
    fireEvent.keyDown(bar(), { key: 'Enter' });

    await waitFor(() => {
      expect(written).toEqual(['\u{1B}[200~for f in *; do\n  echo "$f"\ndone\u{1B}[201~\r']);
    });
  });

  it('sends clear directly to the shell terminal', async () => {
    const { capabilities, written } = renderTab();
    fireEvent.change(bar(), { target: { value: 'clear' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await waitFor(() => { expect(written).toEqual([`clear${String.fromCodePoint(10)}`]); });
    expect(capabilities.intent).not.toHaveBeenCalledWith('dispatch', 'clear');
  });

  it('asks the host about a line as the bare string its own guard accepts', async () => {
    const { capabilities, releaseDispatch } = renderTab({ dispatched: false });

    fireEvent.change(bar(), { target: { value: 'ls -la' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    releaseDispatch();

    await waitFor(() => {
      expect(capabilities.intent).toHaveBeenCalledWith('dispatch', 'ls -la');
    });
  });

  it('does not put a line the application claimed into the shell', async () => {
    const { releaseDispatch, written } = renderTab({ dispatched: true });

    fireEvent.change(bar(), { target: { value: 'theme' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    // Flushed through `act` so the whole promise chain has run before the assertion: before the fix
    // this assertion was already true on the first tick, so it passed whether or not the line was
    // written to the terminal.
    await act(async () => { releaseDispatch(); });

    expect(written).toEqual([]);
  });

  it('displays a claimed application command and its reply without sending either to zsh', async () => {
    const { releaseDispatch, terminal, written } = renderTab({ dispatched: true, output: 'first line\nsecond line' });

    fireEvent.change(bar(), { target: { value: 'help' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });

    expect(written).toEqual([]);
    expect(terminal.written).toContain('\r\u{1B}[2K> help\r\nfirst line\r\nsecond line\r\n> ');
  });

  it('renders a claimed command\'s markdown reply as styled terminal text rather than raw markup', async () => {
    const escape = String.fromCodePoint(0x1B);
    const { releaseDispatch, terminal } = renderTab({ dispatched: true, output: '## Usage\n\nRun **zsh**' });

    fireEvent.change(bar(), { target: { value: 'help' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });

    const shown = terminal.written.at(-1) ?? '';
    expect(shown).toContain(`${escape}[1mUsage${escape}[22m`);
    expect(shown).toContain(`Run ${escape}[1mzsh${escape}[22m`);
    expect(shown).not.toContain('**');
    expect(shown).not.toContain('##');
  });

  it('records an intercepted application command in shell history', async () => {
    const { releaseDispatch, written } = renderTab({ dispatched: true });

    fireEvent.change(bar(), { target: { value: 'theme' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });
    expect(written).toEqual([]);

    // Up recalls handled application commands even though none of them reached the terminal.
    fireEvent.keyDown(bar(), { key: 'ArrowUp' });
    expect(bar().value).toBe('theme');
  });

  it('records a dispatched application command in shell history', async () => {
    const { releaseDispatch, written } = renderTab({ dispatched: true });

    fireEvent.change(bar(), { target: { value: 'help' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });

    expect(written).toEqual([]);
    fireEvent.keyDown(bar(), { key: 'ArrowUp' });
    expect(bar().value).toBe('help');
  });

  it('records a line the shell was sent as recallable history', async () => {
    const { releaseDispatch, written } = renderTab({ dispatched: false });

    fireEvent.change(bar(), { target: { value: 'ls -la' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });
    expect(written).toEqual(['ls -la\n']);

    fireEvent.keyDown(bar(), { key: 'ArrowUp' });
    expect(bar().value).toBe('ls -la');
  });

  it('records a command typed into the terminal as recallable history', () => {
    renderTab();

    act(() => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`C;${NONCE};${btoa('git status')}`); });

    fireEvent.keyDown(bar(), { key: 'ArrowUp' });
    expect(bar().value).toBe('git status');
  });

  it('keeps a whitespace-only terminal command out of history and trims a padded one', () => {
    renderTab();

    act(() => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`C;${NONCE};${btoa('  pwd  ')}`); });
    act(() => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`C;${NONCE};${btoa(' \t ')}`); });

    fireEvent.keyDown(bar(), { key: 'ArrowUp' });
    expect(bar().value).toBe('pwd');
    fireEvent.keyDown(bar(), { key: 'ArrowUp' });
    expect(bar().value).toBe('pwd');
  });

  it('records a line the bar sent once, even after zsh reports running it', async () => {
    const { releaseDispatch, written } = renderTab({ dispatched: false });
    fireEvent.change(bar(), { target: { value: 'ls -la' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });
    expect(written).toEqual(['ls -la\n']);

    act(() => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`C;${NONCE};${btoa('ls -la')}`); });
    await act(async () => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`D;${NONCE}`); });
    fireEvent.change(bar(), { target: { value: 'hist' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });

    await waitFor(() => { expect(document.querySelector('.picker.shell-history')).not.toBeNull(); });
    const rows = [...document.querySelectorAll('.shell-history .picker-row')].map((row) => row.textContent);
    expect(rows).toEqual(['ls -la']);
  });

  it('sends a marker-prefixed line to the shell whatever the application would claim', async () => {
    const { capabilities, written } = renderTab({ dispatched: true });

    fireEvent.change(bar(), { target: { value: '!theme' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });

    await waitFor(() => { expect(written).toEqual(['theme\n']); });
    expect(capabilities.intent).not.toHaveBeenCalledWith('dispatch', expect.anything());
  });

  it('clears the bar after submitting', async () => {
    const { releaseDispatch } = renderTab();

    fireEvent.change(bar(), { target: { value: 'ls' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });

    expect(bar().value).toBe('');
  });

  it('sends Ctrl+C to the shell when the bar holds no selection', async () => {
    const { written } = renderTab();

    fireEvent.keyDown(bar(), { key: 'c', ctrlKey: true });

    await waitFor(() => { expect(written).toEqual([String.fromCodePoint(3)]); });
  });

  it('copies the bar\'s own selection instead of interrupting when there is one', async () => {
    const { capabilities, written } = renderTab();
    const input = bar();
    fireEvent.change(input, { target: { value: 'hello' } });
    input.setSelectionRange(0, 5);

    fireEvent.keyDown(input, { key: 'c', ctrlKey: true });

    expect(written).toEqual([]);
    expect(capabilities.copyText).toHaveBeenCalledWith('hello');
  });

  it('sends Ctrl+D and Ctrl+Z to the shell whatever the bar holds', async () => {
    const { written } = renderTab();

    fireEvent.keyDown(bar(), { key: 'd', ctrlKey: true });
    fireEvent.keyDown(bar(), { key: 'z', ctrlKey: true });

    await waitFor(() => {
      expect(written).toEqual([String.fromCodePoint(4), String.fromCodePoint(26)]);
    });
  });

  it('leaves the application\'s own chords alone', () => {
    const { written } = renderTab();

    fireEvent.keyDown(bar(), { key: 'a', ctrlKey: true });
    fireEvent.keyDown(bar(), { key: 'g', ctrlKey: true });

    // Neither reaches the shell and neither is swallowed here: `Ctrl+A` and `Ctrl+G` belong to the
    // application in every tab, and this bar has no business taking them.
    expect(written).toEqual([]);
  });

  it('completes from the application and shows a strip when there is a choice', async () => {
    renderTab({ completions: { matches: ['ls', 'lsof'], newInput: 'ls', newCursor: 2 } });

    fireEvent.change(bar(), { target: { value: 'l' } });
    fireEvent.keyDown(bar(), { key: 'Tab' });

    await waitFor(() => { expect(screen.getByText('lsof')).toBeInTheDocument(); });
    expect(screen.getByText('ls')).toBeInTheDocument();
    expect(document.querySelector('.completions')?.textContent).toBe('ls  lsof');
  });

  it('dismisses completion choices on Escape without changing the command line', async () => {
    renderTab({ completions: { matches: ['ls', 'lsof'], newInput: 'ls', newCursor: 2 } });

    fireEvent.change(bar(), { target: { value: 'l' } });
    fireEvent.keyDown(bar(), { key: 'Tab' });
    await waitFor(() => { expect(document.querySelector('.completions')).not.toBeNull(); });

    fireEvent.keyDown(bar(), { key: 'Escape' });

    expect(document.querySelector('.completions')).toBeNull();
    expect(bar().value).toBe('l');
  });

  it('accepts a single completion without showing a strip', async () => {
    renderTab({ completions: { matches: ['ls'], newInput: 'ls', newCursor: 2 } });

    fireEvent.change(bar(), { target: { value: 'l' } });
    fireEvent.keyDown(bar(), { key: 'Tab' });

    await waitFor(() => { expect(bar().value).toBe('ls'); });
    expect(document.querySelector('.completions')).toBeNull();
  });

  it('recalls the lines it has sent on Up, newest first', async () => {
    const { releaseDispatch, written } = renderTab();

    fireEvent.change(bar(), { target: { value: 'first' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });
    expect(written).toEqual(['first\n']);
    act(() => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`C;${NONCE}`); });
    await act(async () => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`D;${NONCE}`); });
    fireEvent.change(bar(), { target: { value: 'second' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });
    expect(written).toHaveLength(2);

    fireEvent.keyDown(bar(), { key: 'ArrowUp' });
    expect(bar().value).toBe('second');
    fireEvent.keyDown(bar(), { key: 'ArrowUp' });
    expect(bar().value).toBe('first');
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    expect(bar().value).toBe('second');
  });

  it('shows and accepts a ghost suggestion from the application global history', () => {
    const { written } = renderTab({ ghostHistory: ['git status'] });
    const input = bar();

    fireEvent.change(input, { target: { value: 'git' } });

    expect(document.querySelector('.ghost')?.textContent).toBe('git status');
    input.setSelectionRange(3, 3);
    fireEvent.keyDown(input, { key: 'ArrowRight' });

    expect(input.value).toBe('git status');
    expect(written).toEqual([]);
  });

  it('leaves a paste in the bar rather than running it', () => {
    const { written } = renderTab();

    fireEvent.change(bar(), { target: { value: 'rm -rf build\nrm -rf dist' } });

    expect(bar().value).toBe('rm -rf build\nrm -rf dist');
    expect(written).toEqual([]);
  });

  it('asks once on mount whether the shell behind it is still running', async () => {
    const { capabilities } = renderTab();

    await waitFor(() => {
      // `null` rather than `undefined`: the request is serialized with `JSON.stringify`, which drops
      // an `undefined` value, and the server's `pluginIntent` guard requires the key to be present —
      // so `undefined` here is an intent the host refuses before the plugin is ever asked.
      expect(capabilities.intent).toHaveBeenCalledWith('terminal-status', null);
    });
  });

  it('asks with a payload that survives the wire', async () => {
    const { capabilities } = renderTab();

    await waitFor(() => { expect(capabilities.intent).toHaveBeenCalled(); });
    const call = (capabilities.intent as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .find((entry) => entry[0] === 'terminal-status');
    expect(call).toBeDefined();
    // The shape the client actually puts on the wire, not the shape it holds in memory: the request
    // params are serialized, and a key whose value is `undefined` does not survive that step.
    const params = { tab: 'shell1', intent: 'terminal-status', payload: call![1] };
    const wire = JSON.stringify(params);
    expect(JSON.parse(wire)).toHaveProperty('payload');
  });

  it('reports a refused status question rather than leaving it unhandled', async () => {
    const { capabilities } = renderTab();
    const intent = capabilities.intent as unknown as { mockImplementation: (fn: () => unknown) => void };
    intent.mockImplementation(() => Promise.reject(new Error('Plugin intent "terminal-status" failed')));

    mountShell(PAYLOAD, capabilities);

    await waitFor(() => { expect(capabilities.reportFailure).toHaveBeenCalled(); });
  });

  it('closes a tab whose shell exited while no browser was attached', async () => {
    const { closed } = renderTab({ status: { running: false } });

    await waitFor(() => { expect(closed).toHaveLength(1); });
  });

  it('leaves a tab whose shell is still running alone', async () => {
    const { closed } = renderTab({ status: { running: true } });

    await waitFor(() => { expect(screen.getByLabelText('Shell command')).toBeInTheDocument(); });
    expect(closed).toEqual([]);
  });

  it('claims the hook install for a shell with none yet and types the setup line it won', async () => {
    const made = makeCapabilities();
    const writes = vi.spyOn(made.handle, 'write');

    mountShell(PAYLOAD, made.capabilities);

    await waitFor(() => {
      expect(writes.mock.calls.some(([data]) => data.startsWith("export PROMPT='> '"))).toBe(true);
    });
    expect(made.capabilities.intent).toHaveBeenCalledWith('install-hooks', NONCE);
  });

  it('types no setup line into a shell whose hooks an earlier attach installed', async () => {
    const made = makeCapabilities();
    const writes = vi.spyOn(made.handle, 'write');

    mountShell({ ...PAYLOAD, hookNonce: 'b'.repeat(32) }, made.capabilities);

    await waitFor(() => { expect(made.capabilities.intent).toHaveBeenCalledWith('terminal-status', null); });
    expect(made.capabilities.intent).not.toHaveBeenCalledWith('install-hooks', expect.anything());
    expect(writes.mock.calls.some(([data]) => data.startsWith("export PROMPT='> '"))).toBe(false);
  });

  it('holds focus in the command bar rather than the terminal', async () => {
    renderTab();

    // A tab that has just become visible starts with the command bar focused.
    await waitFor(() => { expect(document.activeElement).toBe(bar()); });
  });

  it('focuses the terminal when it is clicked', () => {
    renderTab();
    const body = document.querySelector('.shell-body')!;

    fireEvent.mouseDown(body);

    expect(terminals.at(-1)?.focusCalls).toBe(1);
  });

  it('claims Ctrl+R while its tab is visible, and the host spends the claim on it', async () => {
    const { chords } = renderTab();

    expect(document.querySelector('.shell-history')).toBeNull();
    // What the window key handler does on the application's behalf: consult the registry first.
    chords.run('ctrl+r', 'shell1');

    await waitFor(() => { expect(document.querySelector('.picker.shell-history')).not.toBeNull(); });
    expect(document.querySelector('.shell-history .picker-title')?.textContent).toBe('history');
    expect(screen.getByText('No commands sent yet')).toBeInTheDocument();
  });

  it('opens the fuzzy tab navigator for nav, on the query typed after it, without reaching zsh', async () => {
    const { capabilities, openers, written } = renderTab();

    fireEvent.change(bar(), { target: { value: 'nav docs' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });

    await waitFor(() => { expect(openers.openTabNavWithQuery).toHaveBeenCalledWith('docs'); });
    expect(capabilities.intent).not.toHaveBeenCalledWith('dispatch', 'nav docs');
    expect(written).toEqual([]);
  });

  it('opens the same history for hist as for Ctrl+R, listing the lines the bar sent', async () => {
    const { capabilities, openers, written } = renderTab();
    fireEvent.change(bar(), { target: { value: '!ls -la' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await waitFor(() => { expect(written).toEqual(['ls -la\n']); });
    act(() => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`C;${NONCE}`); });
    await act(async () => { commandStateHandlers.findLast(({ id }) => id === 133)?.handle(`D;${NONCE}`); });

    fireEvent.change(bar(), { target: { value: 'hist' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });

    await waitFor(() => { expect(document.querySelector('.picker.shell-history')).not.toBeNull(); });
    const rows = [...document.querySelectorAll('.shell-history .picker-row')].map((row) => row.textContent);
    expect(rows).toEqual(['!ls -la']);
    expect(openers.openPicker).not.toHaveBeenCalled();
    expect(capabilities.intent).not.toHaveBeenCalledWith('dispatch', 'hist');
    expect(written).toEqual(['ls -la\n']);
  });

  it('claims nothing at all while its tab is hidden, so the application keeps the chord', () => {
    const { chords } = renderTab({ active: false });

    expect(chords.run('ctrl+r', 'shell1')).toBe(false);
    expect(document.querySelector('.shell-history')).toBeNull();
  });

  it('claims no chord the declaration does not name', () => {
    const { chords } = renderTab();

    expect(chords.run('ctrl+g', 'shell1')).toBe(false);
  });

  it('claims whatever chord the host sent, rather than one written out beside it', async () => {
    // `ctrl+t` is not in the shell manifest; if the body honoured its own copy of the claim this
    // would still be `ctrl+r` and the case below would pass for the wrong reason.
    const { chords } = renderTab({ claimedChords: ['ctrl+t'] });

    expect(chords.run('ctrl+r', 'shell1')).toBe(false);
    chords.run('ctrl+t', 'shell1');

    await waitFor(() => { expect(document.querySelector('.shell-history')).not.toBeNull(); });
  });

  it('gives each shell tab its own status-window identity', () => {
    // Two tabs, two labels: the hook re-arms its auto-show when this changes, so a constant would
    // leave the second tab's windows armed only once at mount.
    const rows = [{ text: 'zsh', kind: 'terminal' as const }];
    const first = mountShell({ ...PAYLOAD, connections: rows }, makeCapabilities({ label: 'shell' }).capabilities);
    expect(screen.getByText('connections')).toBeInTheDocument();
    first.unmount();

    mountShell({ ...PAYLOAD, connections: rows }, makeCapabilities({ label: 'shell2' }).capabilities);
    expect(screen.getByText('connections')).toBeInTheDocument();
  });

  it('re-arms status windows when the shell tab becomes active again', () => {
    vi.useFakeTimers();
    const rows = [{ text: 'zsh', kind: 'terminal' as const }];
    const { capabilities } = makeCapabilities();
    const view = mountShell({ ...PAYLOAD, connections: rows }, capabilities);
    try {
      expect(screen.getByText('zsh')).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(5300); });
      expect(screen.queryByText('zsh')).not.toBeInTheDocument();

      capabilities.active = false;
      act(() => { view.rerenderShell(); });
      expect(screen.queryByText('zsh')).not.toBeInTheDocument();

      capabilities.active = true;
      act(() => { view.rerenderShell(); });
      expect(screen.getByText('zsh')).toBeInTheDocument();
    } finally {
      view.unmount();
      vi.useRealTimers();
    }
  });

  it('keeps the keyboard in the command bar while its history popup is open', async () => {
    const { chords } = renderTab();
    await waitFor(() => { expect(document.activeElement).toBe(bar()); });

    chords.run('ctrl+r', 'shell1');

    // The popup took focus on mount and nothing handed it back, so after Escape or a pick the focused
    // element was removed from the document and the keyboard landed on the body.
    await waitFor(() => { expect(document.querySelector('.shell-history')).not.toBeNull(); });
    expect(document.activeElement).toBe(bar());
  });

  it('puts the second-newest line in the bar on Up then Return', async () => {
    const { chords, releaseDispatch } = renderTab({ dispatched: false });
    for (const line of ['first', 'second']) {
      fireEvent.change(bar(), { target: { value: line } });
      fireEvent.keyDown(bar(), { key: 'Enter' });
      await act(async () => { releaseDispatch(); });
    }

    chords.run('ctrl+r', 'shell1');
    await waitFor(() => { expect(document.querySelector('.shell-history')).not.toBeNull(); });
    // The popup puts the newest line at the bottom, like the application picker, so Up moves older.
    fireEvent.keyDown(bar(), { key: 'ArrowUp' });
    await waitFor(() => {
      expect(document.querySelector('.shell-history .picker-row.selected')?.textContent).toBe('first');
    });
    fireEvent.keyDown(bar(), { key: 'ArrowDown' });
    await waitFor(() => {
      expect(document.querySelector('.shell-history .picker-row.selected')?.textContent).toBe('second');
    });
    fireEvent.keyDown(bar(), { key: 'ArrowUp' });
    fireEvent.keyDown(bar(), { key: 'Enter' });

    await waitFor(() => { expect(bar().value).toBe('first'); });
    expect(document.querySelector('.shell-history')).toBeNull();
  });

  it('closes the history popup on Escape and gives the keyboard back to the bar', async () => {
    const { chords } = renderTab();
    chords.run('ctrl+r', 'shell1');
    await waitFor(() => { expect(document.querySelector('.shell-history')).not.toBeNull(); });

    fireEvent.keyDown(bar(), { key: 'Escape' });

    await waitFor(() => { expect(document.querySelector('.shell-history')).toBeNull(); });
    expect(document.activeElement).toBe(bar());
  });

  it('gives the keyboard back to the bar when a history row is clicked', async () => {
    const { chords, releaseDispatch } = renderTab({ dispatched: false });
    fireEvent.change(bar(), { target: { value: 'only' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });

    chords.run('ctrl+r', 'shell1');
    await waitFor(() => { expect(document.querySelector('.shell-history')).not.toBeNull(); });
    fireEvent.click(screen.getByText('only'));

    await waitFor(() => { expect(document.querySelector('.shell-history')).toBeNull(); });
    expect(bar().value).toBe('only');
    expect(document.activeElement).toBe(bar());
  });

  it('claims nothing when the tab carries no claim at all', () => {
    const { chords } = renderTab({ claimedChords: [] });

    expect(chords.run('ctrl+r', 'shell1')).toBe(false);
    expect(document.querySelector('.shell-history')).toBeNull();
  });

  it('opens a bare word\'s own picker rather than offering the word to the server', async () => {
    const { capabilities, openers, releaseDispatch, written } = renderTab({ dispatched: true });

    fireEvent.change(bar(), { target: { value: 'theme' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });

    // `product/specs/shell-tab.md` says `theme` opens the theme picker in a shell tab, so the bar runs
    // the application's own interception rather than asking the dispatcher and showing nothing.
    expect(openers.openAppThemePicker).toHaveBeenCalledTimes(1);
    expect(capabilities.intent).not.toHaveBeenCalledWith('dispatch', expect.anything());
    expect(written).toEqual([]);
  });

  it('runs a claimed word carrying an argument, because the bare word is what opens the overlay', async () => {
    const { capabilities, releaseDispatch, written } = renderTab({ dispatched: true });

    fireEvent.change(bar(), { target: { value: 'theme dark' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });

    expect(capabilities.intent).toHaveBeenCalledWith('dispatch', 'theme dark');
    expect(written).toEqual([]);
  });

  it('asks before quitting the application, and offers the line to nobody', () => {
    const { capabilities, openQuitConfirm, releaseDispatch } = renderTab();

    fireEvent.change(bar(), { target: { value: 'quit' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    releaseDispatch();

    // `src/commands/quit.ts` is a bare exit emit with nothing asked anywhere on the path, so a shell
    // tab offering this line unguarded tore down every tab, shell, terminal and browser in the window.
    expect(openQuitConfirm).toHaveBeenCalledTimes(1);
    expect(capabilities.intent).not.toHaveBeenCalledWith('dispatch', expect.anything());
  });

  it('asks before slash-prefixed quit and last-tab close commands without dispatching them', () => {
    for (const line of ['/quit', '/close', '/exit']) {
      const made = renderTab();
      fireEvent.change(bar(), { target: { value: line } });
      fireEvent.keyDown(bar(), { key: 'Enter' });

      expect(made.openQuitConfirm, line).toHaveBeenCalledTimes(1);
      expect(made.capabilities.intent, line).not.toHaveBeenCalledWith('dispatch', expect.anything());
      made.unmount();
    }
  });

  it('puts a slash-prefixed named close through the save guard instead of dispatching it', () => {
    const guard = vi.fn(() => true);
    const { capabilities } = renderTab({ tabs: [tab('shell1'), tab('other')], guard });

    fireEvent.change(bar(), { target: { value: '/close other' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });

    expect(guard).toHaveBeenCalledWith(1);
    expect(capabilities.intent).not.toHaveBeenCalledWith('dispatch', expect.anything());
  });

  it('asks before a close that would take the last tab with it, by either spelling', () => {
    for (const line of ['close', 'exit', 'close shell1']) {
      const made = renderTab();
      fireEvent.change(bar(), { target: { value: line } });
      fireEvent.keyDown(bar(), { key: 'Enter' });

      expect(made.openQuitConfirm, line).toHaveBeenCalledTimes(1);
      made.unmount();
    }
  });

  it('closes another tab directly, which is what a close that would not quit has always done here', async () => {
    const { capabilities, openQuitConfirm, releaseDispatch } = renderTab({
      tabs: [tab('shell1'), tab('other')],
    });

    fireEvent.change(bar(), { target: { value: 'close other' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });

    expect(openQuitConfirm).not.toHaveBeenCalled();
    expect(capabilities.intent).toHaveBeenCalledWith('dispatch', 'close other');
  });

  it('runs a close the application claims through the same interception it uses everywhere', async () => {
    const { capabilities, releaseDispatch } = renderTab({ tabs: [tab('shell1'), tab('other')] });

    fireEvent.change(bar(), { target: { value: 'exit' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });

    expect(capabilities.intent).toHaveBeenCalledWith('dispatch', 'exit');
  });
});
