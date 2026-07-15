import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TabView, RouteChooserView } from '@shared/protocol';
import userEvent from '@testing-library/user-event';

const sendMock = vi.fn();
const renameTabMock = vi.fn();
const requestMock = vi.fn().mockResolvedValue({ newInput: '', newCursor: 0, matches: [] });
type StateListener = (
  tabs: TabView[], activeTab: number, route: RouteChooserView | null, tabNameMaxLength: number, globalHistory: string[],
  syntaxTheme: string, theme: string, tasks: string[],
) => void;
let stateListener: StateListener | null = null;

vi.mock('./ws', () => {
  class JanusClient {
    send = sendMock;
    request = requestMock;
    onState(l: StateListener) { stateListener = l; return () => {}; }
    onPtyExit() { return () => {}; }
    attachPty() { return () => {}; }
    renameTab = renameTabMock;
    saveFile() { return Promise.resolve(undefined); }
  }
  return { JanusClient };
});

vi.mock('./useXterm', () => ({
  useXterm: () => vi.fn(),
}));

// jsdom doesn't include ResizeObserver — Transcript observes its content element.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

function makeTab(overrides: Partial<TabView> = {}): TabView {
  return {
    label: 'janus', number: 1, dotColor: '#fff', group: 0, groupColor: '#000',
    busy: false, hasUnread: false, cwd: '/tmp', connections: [], schedule: [],
    bufferLines: [], cmdHistory: [], commandQueue: [], toolStepsExpanded: false,
    ...overrides,
  };
}

describe('App transcript-search interception', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('does not send a command RPC when the pattern matches, opening search instead', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab({ bufferLines: [{ type: 'output', text: 'an error occurred' }] })], 0, null, 16, [], 'github-dark', 'dark', []); });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'search transcript error' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(sendMock).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'command' }));
    expect(screen.getByText(/error/, { selector: '.search-result' })).toBeInTheDocument();
  }, 15_000);

  it('sends a command RPC when the pattern has no matches', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab({ bufferLines: [{ type: 'output', text: 'all good' }] })], 0, null, 16, [], 'github-dark', 'dark', []); });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'search transcript zzznotfound' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(sendMock).toHaveBeenCalledWith({ method: 'command', params: { text: 'search transcript zzznotfound' } });
  }, 15_000);
});

describe('App agent tab metadata row', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('renders the active tab\'s cwd and flags in the metadata row', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab({ cwd: '~/project', flags: ['workspaced'] })], 0, null, 16, [], 'github-dark', 'dark', []); });
    expect(screen.getByText('~/project')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Workspaced' })).toBeInTheDocument();
  });
});

describe('App syntax theme picker', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('opens the theme picker on "syntax theme" and sends "syntax theme <name>" on Enter', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab()], 0, null, 16, [], 'github-dark', 'dark', []); });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'syntax theme' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('syntax theme', { selector: '.picker-title' })).toBeInTheDocument();
    fireEvent.keyDown(globalThis as unknown as Window, { key: 'Enter' });
    expect(sendMock).toHaveBeenCalledWith({ method: 'command', params: { text: 'syntax theme github-dark' } });
  }, 15_000);

  it('sends "close" as a command when there are multiple tabs', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab(), makeTab({ label: 'other' })], 0, null, 16, [], 'github-dark', 'dark', []); });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'close' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(sendMock).toHaveBeenCalledWith({ method: 'command', params: { text: 'close' } });
  }, 15_000);

  it('renders a reporting section when a monitor tab is present', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab({ view: 'monitor', monitor: { suggestions: [], persona: 'assistant', targets: '', contextBytes: 0 }, groupColor: '#0f0' })], 0, null, 16, [], 'github-dark', 'dark', []); });
    expect(screen.getByText('janus')).toBeTruthy();
  }, 15_000);
});

describe('App tab navigator', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('opens the tab navigator seeded with the query on "nav <query>" instead of sending it to the server', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab({ label: 'deploy' }), makeTab({ label: 'shell', number: 2 })], 0, null, 16, [], 'github-dark', 'dark', []); });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'nav depl' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('nav: depl')).toBeInTheDocument();
    expect(sendMock).not.toHaveBeenCalledWith({ method: 'command', params: { text: 'nav depl' } });
  }, 15_000);
});

describe('App queue popup', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('opens the queue popup on "queue" instead of sending a command RPC', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab({ commandQueue: ['echo hi'] })], 0, null, 16, [], 'github-dark', 'dark', []); });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'queue' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('queue', { selector: '.picker-title' })).toBeInTheDocument();
    expect(sendMock).not.toHaveBeenCalledWith({ method: 'command', params: { text: 'queue' } });
  }, 15_000);

  it('selecting the front entry copies it into the command line', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab({ commandQueue: ['echo hi', 'echo bye'] })], 0, null, 16, [], 'github-dark', 'dark', []); });
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'queue' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('echo hi');
  }, 15_000);

  it('Cmd+W does nothing while the queue popup is open', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab({ commandQueue: ['echo hi'] })], 0, null, 16, [], 'github-dark', 'dark', []); });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'queue' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    sendMock.mockClear();
    fireEvent.keyDown(globalThis as unknown as Window, { key: 'w', metaKey: true });
    expect(sendMock).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'closeTab' }));
  }, 15_000);

  it('Escape closes the queue popup and clears the command line', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab({ commandQueue: ['echo hi', 'echo bye'] })], 0, null, 16, [], 'github-dark', 'dark', []); });
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'queue' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input.value).toBe('echo hi');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('queue', { selector: '.picker-title' })).not.toBeInTheDocument();
    expect(input.value).toBe('');
  }, 15_000);
});

describe('App closing the last tab', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('clicking the tab strip × on the only remaining tab opens the quit dialog instead of sending closeTab', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => { stateListener!([makeTab()], 0, null, 16, [], 'github-dark', 'dark', []); });
    fireEvent.click(container.querySelector('.tab-close')!);
    expect(screen.getByText('Are you sure you want to quit?')).toBeInTheDocument();
    expect(sendMock).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'closeTab' }));
  }, 15_000);

  it('Cmd+W on the only remaining tab opens the quit dialog instead of sending closeTab', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab()], 0, null, 16, [], 'github-dark', 'dark', []); });
    fireEvent.keyDown(globalThis as unknown as Window, { key: 'w', metaKey: true });
    expect(screen.getByText('Are you sure you want to quit?')).toBeInTheDocument();
    expect(sendMock).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'closeTab' }));
  }, 15_000);

  it('clicking the tab strip × still sends closeTab directly when another tab remains', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => { stateListener!([makeTab({ label: 'one' }), makeTab({ label: 'two' })], 0, null, 16, [], 'github-dark', 'dark', []); });
    fireEvent.click(container.querySelector('.tab-close')!);
    expect(sendMock).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 0 } });
    expect(screen.queryByText('Are you sure you want to quit?')).not.toBeInTheDocument();
  }, 15_000);
});

describe('App agent tab body click focuses command input', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('mouseup on the agent tab body focuses the command input textarea when nothing is selected', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => {
      stateListener!([makeTab()], 0, null, 16, [], 'github-dark', 'dark', []);
    });
    const tabBody = container.querySelector('.tab-body') as HTMLElement;
    expect(tabBody).not.toBeNull();
    fireEvent.mouseUp(tabBody);
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
  }, 15_000);

  it('does not steal focus on mouseup when the transcript has a text selection', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => {
      stateListener!([makeTab()], 0, null, 16, [], 'github-dark', 'dark', []);
    });
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const spy = vi.spyOn(globalThis, 'getSelection').mockReturnValue({ toString: () => 'some selected text' } as Selection);
    const input = screen.getByRole('textbox');
    (input as HTMLElement).blur();
    const tabBody = container.querySelector('.tab-body') as HTMLElement;
    fireEvent.mouseUp(tabBody);
    expect(document.activeElement).not.toBe(input);
    spy.mockRestore();
  }, 15_000);

  it('copies selected text to the clipboard on mouseup instead of focusing the input', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => {
      stateListener!([makeTab()], 0, null, 16, [], 'github-dark', 'dark', []);
    });
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const spy = vi.spyOn(globalThis, 'getSelection').mockReturnValue({ toString: () => 'some selected text' } as Selection);
    const tabBody = container.querySelector('.tab-body') as HTMLElement;
    fireEvent.mouseUp(tabBody);
    expect(writeText).toHaveBeenCalledWith('some selected text');
    spy.mockRestore();
  }, 15_000);
});

describe('App sidebar docking', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('a docked file tree tab is absent from the tab strip but rendered in its sidebar', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => {
      stateListener!(
        [
          makeTab(),
          makeTab({
            label: 'files', view: 'files', dock: 'left',
            files: { root: '/tmp/project', rows: [] },
          }),
        ],
        0, null, 16, [], 'github-dark', 'dark', [],
      );
    });
    const stripLabels = [...container.querySelectorAll(':scope .tabstrip .tab')].map((el) => el.textContent);
    expect(stripLabels.some((t) => t?.includes('files'))).toBe(false);
    expect(container.querySelector('.sidebar-left')).not.toBeNull();
  }, 15_000);

  it('closing a docked tab via its sidebar header × sends closeTab with its server index', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => {
      stateListener!(
        [
          makeTab(),
          makeTab({
            label: 'files', view: 'files', dock: 'left',
            files: { root: '/tmp/project', rows: [] },
          }),
        ],
        0, null, 16, [], 'github-dark', 'dark', [],
      );
    });
    fireEvent.click(container.querySelector(':scope .sidebar-left .sidebar-tab-close')!);
    expect(sendMock).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 1 } });
  }, 15_000);
});

describe('App tab rename', () => {
  beforeEach(() => {
    sendMock.mockClear();
    renameTabMock.mockClear();
    stateListener = null;
  });

  it('renames a tab via double-click', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab()], 0, null, 16, [], 'github-dark', 'dark', []); });
    await userEvent.dblClick(screen.getByText('janus'));
    const input = screen.getByDisplayValue('janus');
    await act(async () => { fireEvent.change(input, { target: { value: 'my project' } }); });
    await act(async () => { fireEvent.keyDown(input, { key: 'Enter' }); });
    expect(renameTabMock).toHaveBeenCalledWith(0, 'my project');
  }, 15_000);
});

describe('App ACP prompt toggles collapse', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('clicking an ACP prompt line sends toggleCollapse', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => {
      stateListener!([makeTab({ bufferLines: [{ type: 'prompt', acp: true, text: 'some command' }] })], 0, null, 16, [], 'github-dark', 'dark', []);
    });
    fireEvent.click(screen.getByText('+ some command'));
    expect(sendMock).toHaveBeenCalledWith({ method: 'toggleCollapse', params: {} });
  }, 15_000);
});

describe('App non-ACP prompt double-click runs command', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('double-clicking a non-ACP prompt line sends the command', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => {
      stateListener!([makeTab({ bufferLines: [{ type: 'prompt', text: 'git status' }] })], 0, null, 16, [], 'github-dark', 'dark', []);
    });
    fireEvent.dblClick(screen.getByText('❯ git status'));
    expect(sendMock).toHaveBeenCalledWith({ method: 'command', params: { text: 'git status' } });
  }, 15_000);
});

describe('App search on Cmd+F', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('opens the search bar on Cmd+F when the tab is searchable', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => { stateListener!([makeTab({ bufferLines: [{ type: 'output', text: 'hello' }] })], 0, null, 16, [], 'github-dark', 'dark', []); });
    expect(container.querySelector('.search-bar')).toBeNull();
    fireEvent.keyDown(globalThis as unknown as Window, { key: 'f', metaKey: true });
    expect(container.querySelector('.search-bar')).not.toBeNull();
  }, 15_000);

  it('does not open search on Cmd+F when the tab has an active PTY', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => { stateListener!([makeTab({ activePty: 'pty-1' })], 0, null, 16, [], 'github-dark', 'dark', []); });
    fireEvent.keyDown(globalThis as unknown as Window, { key: 'f', metaKey: true });
    expect(container.querySelector('.search-bar')).toBeNull();
  }, 15_000);

  it('does not open search on Cmd+F when the tab is a view tab', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => { stateListener!([makeTab({ view: 'markdown' })], 0, null, 16, [], 'github-dark', 'dark', []); });
    fireEvent.keyDown(globalThis as unknown as Window, { key: 'f', metaKey: true });
    expect(container.querySelector('.search-bar')).toBeNull();
  }, 15_000);
});

describe('App shell tab', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('renders a ShellTab body when a tab has an active PTY', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => { stateListener!([makeTab({ activePty: 'pty-1' })], 0, null, 16, [], 'github-dark', 'dark', []); });
    expect(container.querySelector('.harness-body')).not.toBeNull();
  }, 15_000);

  it('removes the ShellTab body when the active PTY is gone', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => { stateListener!([makeTab({ activePty: 'pty-1' })], 0, null, 16, [], 'github-dark', 'dark', []); });
    expect(container.querySelector('.harness-body')).not.toBeNull();
    act(() => { stateListener!([makeTab()], 0, null, 16, [], 'github-dark', 'dark', []); });
    expect(container.querySelector('.harness-body')).toBeNull();
  }, 15_000);
});

describe('App autocomplete', () => {
  beforeEach(() => {
    sendMock.mockClear();
    requestMock.mockClear();
    stateListener = null;
  });

  it('triggers completion on Tab', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab()], 0, null, 16, [], 'github-dark', 'dark', []); });
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'some text' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(requestMock).toHaveBeenCalledWith({ method: 'complete', params: { text: 'some text', cursor: 9 } });
  }, 15_000);
});

describe('App reporting section callbacks', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  const monitorTab = makeTab({
    view: 'monitor',
    monitor: {
      suggestions: [{
        id: 's1',
        text: 'Check build output',
        command: 'npm run build',
        timestamp: Date.now(),
        persona: 'assistant',
        about: 'agent2',
      }],
      persona: 'assistant',
      targets: 'agent2',
      contextBytes: 0,
    },
    groupColor: '#0f0',
  });

  it('calls runSuggestion when clicking a suggestion command', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([monitorTab], 0, null, 16, [], 'github-dark', 'dark', []); });
    await userEvent.click(screen.getByRole('button', { name: 'npm run build' }));
    expect(sendMock).toHaveBeenCalledWith({ method: 'runSuggestion', params: { id: 's1' } });
  }, 15_000);

  it('calls rateSuggestion when clicking thumbs up', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([monitorTab], 0, null, 16, [], 'github-dark', 'dark', []); });
    await userEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    expect(sendMock).toHaveBeenCalledWith({ method: 'rateSuggestion', params: { id: 's1', up: true } });
  }, 15_000);

  it('calls rateSuggestion when clicking thumbs down', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([monitorTab], 0, null, 16, [], 'github-dark', 'dark', []); });
    await userEvent.click(screen.getByRole('button', { name: 'Not helpful' }));
    expect(sendMock).toHaveBeenCalledWith({ method: 'rateSuggestion', params: { id: 's1', up: false } });
  }, 15_000);

  it('calls resetMonitorContext when clicking the reset button', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([monitorTab], 0, null, 16, [], 'github-dark', 'dark', []); });
    await userEvent.click(screen.getByTitle('Reset context'));
    expect(sendMock).toHaveBeenCalledWith({ method: 'resetMonitorContext', params: { name: 'janus' } });
  }, 15_000);

  it('calls monitorContextSnapshot when clicking the snapshot button', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([monitorTab], 0, null, 16, [], 'github-dark', 'dark', []); });
    await userEvent.click(screen.getByTitle('Open context snapshot'));
    expect(sendMock).toHaveBeenCalledWith({ method: 'monitorContextSnapshot', params: { name: 'janus' } });
  }, 15_000);
});
