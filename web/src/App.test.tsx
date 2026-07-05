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
});
