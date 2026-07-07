import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TabView, RouteChooserView } from '@shared/protocol';

const sendMock = vi.fn();
type StateListener = (
  tabs: TabView[], activeTab: number, route: RouteChooserView | null, tabNameMaxLength: number, globalHistory: string[],
  syntaxTheme: string,
) => void;
let stateListener: StateListener | null = null;

vi.mock('./ws', () => {
  class JanusClient {
    send = sendMock;
    request = vi.fn().mockResolvedValue({ newInput: '', newCursor: 0, matches: [] });
    onState(l: StateListener) { stateListener = l; return () => {}; }
    onPtyExit() { return () => {}; }
    attachPty() { return () => {}; }
    renameTab() {}
    saveFile() { return Promise.resolve(undefined); }
  }
  return { JanusClient };
});

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
    bufferLines: [], cmdHistory: [], toolStepsExpanded: false,
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
    act(() => { stateListener!([makeTab({ bufferLines: [{ type: 'output', text: 'an error occurred' }] })], 0, null, 16, [], 'github-dark'); });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'search transcript error' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(sendMock).not.toHaveBeenCalledWith(expect.objectContaining({ method: 'command' }));
    expect(screen.getByText(/error/, { selector: '.search-result' })).toBeInTheDocument();
  }, 15_000);

  it('sends a command RPC when the pattern has no matches', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab({ bufferLines: [{ type: 'output', text: 'all good' }] })], 0, null, 16, [], 'github-dark'); });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'search transcript zzznotfound' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(sendMock).toHaveBeenCalledWith({ method: 'command', params: { text: 'search transcript zzznotfound' } });
  }, 15_000);
});

describe('App syntax theme picker', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('opens the theme picker on "syntax theme" and sends "syntax theme <name>" on Enter', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab()], 0, null, 16, [], 'github-dark'); });
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
    act(() => { stateListener!([makeTab(), makeTab({ label: 'other' })], 0, null, 16, [], 'github-dark'); });
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'close' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(sendMock).toHaveBeenCalledWith({ method: 'command', params: { text: 'close' } });
  }, 15_000);

  it('renders a reporting section when a monitor tab is present', async () => {
    const { App } = await import('./App');
    render(<App />);
    act(() => { stateListener!([makeTab({ view: 'monitor', monitor: { suggestions: [] }, groupColor: '#0f0' })], 0, null, 16, [], 'github-dark'); });
    expect(screen.getByText('janus')).toBeTruthy();
  }, 15_000);
});

describe('App agent tab body click focuses command input', () => {
  beforeEach(() => {
    sendMock.mockClear();
    stateListener = null;
  });

  it('mousedown on the agent tab body focuses the command input textarea', async () => {
    const { App } = await import('./App');
    const { container } = render(<App />);
    act(() => {
      stateListener!([makeTab()], 0, null, 16, [], 'github-dark');
    });
    const tabBody = container.querySelector('.tab-body') as HTMLElement;
    expect(tabBody).not.toBeNull();
    fireEvent.mouseDown(tabBody);
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    expect(document.activeElement).toBe(screen.getByRole('textbox'));
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
        0, null, 16, [], 'github-dark',
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
        0, null, 16, [], 'github-dark',
      );
    });
    fireEvent.click(container.querySelector(':scope .sidebar-left .files-close')!);
    expect(sendMock).toHaveBeenCalledWith({ method: 'closeTab', params: { index: 1 } });
  }, 15_000);
});
