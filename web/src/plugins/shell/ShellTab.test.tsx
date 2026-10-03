import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ShellPayload } from '@shared/plugins/shell/shared';
import type { PluginTerminal, TabPluginClientCapabilities } from '../api';
import { PluginChordProvider, createPluginChordRegistry } from '../PluginChords';
import { ShellTab } from './ShellTab';

// The emulator and its fit addon are stubbed so the tab's own logic — routing, focus, the chord claim —
// is what is under test rather than xterm.js's renderer, which jsdom cannot run. The stub records what
// it was handed, so a resize or a teardown assertion still has something to look at.
const terminals: FakeTerminal[] = [];

interface FakeTerminal {
  written: string[];
  disposed: boolean;
  options: Record<string, unknown>;
  resizes: { cols: number; rows: number }[];
}

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    written: string[] = [];
    disposed = false;
    resizes: { cols: number; rows: number }[] = [];
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
    get cols() { return 100; }
    get rows() { return 30; }
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class { fit() {} activate() {} dispose() {} },
}));

// jsdom has no ResizeObserver, and the terminal registers one. Stubbed rather than installed globally
// so nothing else in the suite can see it.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

const PAYLOAD: ShellPayload = {
  ptyId: 'pty7', cwd: '/repo', workspace: false, cols: 80, rows: 24,
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
  completions?: { matches: string[]; newInput: string; newCursor: number };
  status?: { running: boolean };
  claimedChords?: readonly string[];
} = {}) {
  const written: Written = [];
  const resized: { cols: number; rows: number }[] = [];
  const closed: number[] = [];
  const handle: PluginTerminal = {
    write: (data) => { written.push(data); },
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
    intent: vi.fn(async (name: string) => {
      if (name === 'terminal-status') return overrides.status ?? { running: true };
      if (name === 'dispatch') {
        await answered;
        return { dispatched: overrides.dispatched ?? false };
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
    // `ctrl+r`, so that is the default here too.
    claimedChords: overrides.claimedChords ?? ['ctrl+r'],
  } as unknown as TabPluginClientCapabilities;
  return {
    capabilities, closed, handle, resized, written,
    releaseDispatch: () => { answerDispatch(); },
  };
}

function renderTab(options: Parameters<typeof makeCapabilities>[0] = {}) {
  const made = makeCapabilities(options);
  const chords = createPluginChordRegistry();
  const view = render(
    <PluginChordProvider registry={chords}>
      <ShellTab payload={PAYLOAD} capabilities={made.capabilities} />
    </PluginChordProvider>,
  );
  return { ...made, chords, ...view };
}

function bar(): HTMLTextAreaElement {
  return screen.getByLabelText('Shell command') as HTMLTextAreaElement;
}

describe('ShellTab', () => {
  it('renders the working directory in the metadata row', () => {
    renderTab();

    expect(screen.getByText('/repo')).toBeInTheDocument();
  });

  it('marks the row as workspaced only when the shell started in a workspace', () => {
    const { unmount } = renderTab();
    expect(screen.queryByLabelText('Workspaced')).not.toBeInTheDocument();
    unmount();

    render(
      <PluginChordProvider registry={createPluginChordRegistry()}>
        <ShellTab payload={{ ...PAYLOAD, workspace: true }} capabilities={makeCapabilities().capabilities} />
      </PluginChordProvider>,
    );
    expect(screen.getByLabelText('Workspaced')).toBeInTheDocument();
  });

  it('sends the file navigator and new agent RPCs from its own row buttons', () => {
    const { capabilities } = renderTab();

    fireEvent.click(screen.getByTitle('Open file navigator here'));
    fireEvent.click(screen.getByTitle('New agent here'));

    expect(capabilities.openFileNavigator).toHaveBeenCalledTimes(1);
    expect(capabilities.launchAgentHere).toHaveBeenCalledTimes(1);
  });

  it('renders no transcript control, because the terminal replaced the transcript', () => {
    renderTab();

    expect(document.querySelector('.tab-open-transcript')).toBeNull();
  });

  it('renders the host\'s own connections window from the pushed rows', () => {
    render(
      <PluginChordProvider registry={createPluginChordRegistry()}>
        <ShellTab
          payload={{ ...PAYLOAD, connections: [{ text: 'zsh', kind: 'terminal' }] }}
          capabilities={makeCapabilities().capabilities}
        />
      </PluginChordProvider>,
    );

    // The panel auto-shows for five seconds on activation, which is the host's own behavior rather
    // than anything this plugin does with it.
    expect(screen.getByText('connections')).toBeInTheDocument();
    expect(screen.getByText('zsh')).toBeInTheDocument();
  });

  it('sends a line the host does not claim to the shell', async () => {
    const { releaseDispatch, written } = renderTab({ dispatched: false });

    fireEvent.change(bar(), { target: { value: 'ls -la' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    releaseDispatch();

    await waitFor(() => { expect(written).toEqual(['ls -la\n']); });
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

  it('keeps a line the application claimed out of the shell history', async () => {
    const { releaseDispatch, written } = renderTab({ dispatched: true });

    fireEvent.change(bar(), { target: { value: 'theme' } });
    fireEvent.keyDown(bar(), { key: 'Enter' });
    await act(async () => { releaseDispatch(); });
    expect(written).toEqual([]);

    // Up recalls the lines the bar has sent, so a claimed line must not become one of them.
    fireEvent.keyDown(bar(), { key: 'ArrowUp' });
    expect(bar().value).toBe('');
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

  it('leaves a paste in the bar rather than running it', () => {
    const { written } = renderTab();

    fireEvent.change(bar(), { target: { value: 'rm -rf build\nrm -rf dist' } });

    expect(bar().value).toBe('rm -rf build\nrm -rf dist');
    expect(written).toEqual([]);
  });

  it('asks once on mount whether the shell behind it is still running', async () => {
    const { capabilities } = renderTab();

    await waitFor(() => {
      expect(capabilities.intent).toHaveBeenCalledWith('terminal-status', undefined);
    });
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

  it('holds focus in the command bar rather than the terminal', async () => {
    renderTab();

    // The bar is the only input path, so a tab that has just become visible focuses it rather than
    // leaving the caret wherever the last click happened to land.
    await waitFor(() => { expect(document.activeElement).toBe(bar()); });
  });

  it('returns focus to the command bar when the terminal is clicked', () => {
    renderTab();
    const body = document.querySelector('.shell-body')!;
    const active = globalThis.document.activeElement as HTMLElement | null;
    active?.blur();

    fireEvent.mouseDown(body);

    expect(globalThis.document.activeElement).toBe(bar());
  });

  it('claims Ctrl+R while its tab is visible, and the host spends the claim on it', async () => {
    const { chords } = renderTab();

    expect(document.querySelector('.shell-history')).toBeNull();
    // What the window key handler does on the application's behalf: consult the registry first.
    chords.run('ctrl+r');

    await waitFor(() => { expect(document.querySelector('.shell-history')).not.toBeNull(); });
    expect(screen.getByText('No commands sent yet')).toBeInTheDocument();
  });

  it('claims nothing at all while its tab is hidden, so the application keeps the chord', () => {
    const { chords } = renderTab({ active: false });

    expect(chords.run('ctrl+r')).toBe(false);
    expect(document.querySelector('.shell-history')).toBeNull();
  });

  it('claims no chord the declaration does not name', () => {
    const { chords } = renderTab();

    expect(chords.run('ctrl+g')).toBe(false);
  });

  it('claims whatever chord the host sent, rather than one written out beside it', async () => {
    // `ctrl+t` is not in the shell manifest; if the body honoured its own copy of the claim this
    // would still be `ctrl+r` and the case below would pass for the wrong reason.
    const { chords } = renderTab({ claimedChords: ['ctrl+t'] });

    expect(chords.run('ctrl+r')).toBe(false);
    chords.run('ctrl+t');

    await waitFor(() => { expect(document.querySelector('.shell-history')).not.toBeNull(); });
  });

  it('claims nothing when the tab carries no claim at all', () => {
    const { chords } = renderTab({ claimedChords: [] });

    expect(chords.run('ctrl+r')).toBe(false);
    expect(document.querySelector('.shell-history')).toBeNull();
  });
});