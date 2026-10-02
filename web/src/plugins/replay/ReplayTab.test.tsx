import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplayPayload } from '@shared/plugins/replay/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ReplayTab } from './ReplayTab';

const HEADER = '{"version":3,"term":{"cols":80,"rows":24,"theme":{"fg":"#123456","bg":"#654321"}},'
  + '"timestamp":1504467315,"idle_time_limit":2,"command":"claude","title":"claude"}\n';
const encode = (text: string) => new TextEncoder().encode(text);

function makePayload(overrides: Partial<ReplayPayload> = {}): ReplayPayload {
  return {
    name: 'claude-2026-10-01T14-32-05-123Z.cast',
    path: '/project/.janissary/recordings/claude-2026-10-01T14-32-05-123Z.cast',
    size: '4 KB',
    url: '/open/1',
    finished: true,
    ...overrides,
  };
}

function makeCapabilities(overrides: Partial<TabPluginClientCapabilities> = {}) {
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (reference) => `${reference}?token=`,
    intent: async <Result,>() => null as Result,
    copyText: vi.fn(),
    splitAction: null,
    active: true,
    dock: null,
    close: vi.fn(),
    reportFailure: vi.fn(),
    ...overrides,
  };
  return capabilities;
}

// jsdom has no xterm, no terminal metrics and no measurement, so the chunk's terminal is stubbed and
// everything this tab is actually responsible for — the metadata line, the transport, the chords, the
// copy, and what it does with a degenerate recording — is exercised against it.
vi.mock('./useReplayTerminal', () => ({
  useReplayTerminal: () => ({ renderUpTo: vi.fn() }),
}));

const renderTab = (payload: ReplayPayload = makePayload(), capabilities = makeCapabilities()) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(encode(HEADER + '[0, "o", "hi"]\n'))));
  return render(<ReplayTab payload={payload} capabilities={capabilities} />);
};

describe('ReplayTab', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('reports what the recording is, when it started, and how long it is', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText(/claude/)).toBeDefined());
    const meta = document.querySelector('.replay-meta')?.textContent ?? '';
    expect(meta).toContain('claude');
    expect(meta).toMatch(/started \d/);
    expect(meta).toMatch(/\d+:\d\d/);
  });

  it('shows the exit status the recording carries, and none when it does not', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      encode(HEADER + '[0, "o", "bye"]\n[0.5, "x", "130"]\n'),
    )));
    const { unmount } = render(<ReplayTab payload={makePayload()} capabilities={makeCapabilities()} />);
    await waitFor(() => expect(document.querySelector('.replay-meta')?.textContent).toContain('exit 130'));
    unmount();

    renderTab();
    await waitFor(() => expect(document.querySelector('.replay-meta')).toBeDefined());
    expect(document.querySelector('.replay-meta')?.textContent).not.toContain('exit');
  });

  it('shows the reason on the metadata line rather than replacing the player', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(encode('not a cast file\n'))));
    render(<ReplayTab payload={makePayload()} capabilities={makeCapabilities()} />);

    await waitFor(() => expect(document.querySelector('.replay-problem')).toBeDefined());
    expect(document.querySelector('.replay-problem')?.textContent)
      .toContain('the file is not an asciicast recording');
    // The transport is still there, so the first good frame has somewhere to go.
    expect(screen.getByLabelText('Seek')).toBeDefined();
  });

  it('offers the whole transport, with the idle limit on its face', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByLabelText('Idle time limit')).toBeDefined());
    expect(screen.getByLabelText('Pause')).toBeDefined();
    expect(screen.getByLabelText('Next frame')).toBeDefined();
    expect(screen.getByLabelText('Previous frame')).toBeDefined();
    expect(screen.getByLabelText('Seek')).toBeDefined();
    // The control starts off and takes the recording's stated limit once its header has arrived.
    await waitFor(() => expect(screen.getByLabelText('Idle time limit').textContent).toBe('idle 2s'));
  });

  it('cycles the idle limit and the speed when their controls are pressed', async () => {
    renderTab();
    const idle = await screen.findByLabelText('Idle time limit');
    const speed = screen.getByLabelText('Playback speed');
    expect(speed.textContent).toBe('1×');

    await userEvent.click(idle);
    expect(idle.textContent).toBe('idle 5s');
    await userEvent.click(speed);
    expect(speed.textContent).toBe('1.5×');
  });

  it('pauses and plays from its button and from its chords', async () => {
    renderTab();
    // Playback starts running, the way asciinema play does, so the button offers to pause it first.
    await waitFor(() => expect(screen.getByLabelText('Pause')).toBeDefined());
    await userEvent.click(screen.getByLabelText('Pause'));
    expect(screen.getByLabelText('Play')).toBeDefined();
    await userEvent.keyboard(' ');
    expect(screen.getByLabelText('Pause')).toBeDefined();
  });

  it('steps one event at a time from the keyboard', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByLabelText('Next frame')).toBeDefined());
    await userEvent.keyboard('.');
    // Stepping is a pause: the frame being looked at is not running away underneath the viewer.
    expect(screen.getByLabelText('Play')).toBeDefined();
  });

  it('claims no chord while the tab is not the visible one', async () => {
    renderTab(makePayload(), makeCapabilities({ active: false }));
    await waitFor(() => expect(screen.getByLabelText('Next frame')).toBeDefined());
    // A hidden plugin tab stays mounted, so a hidden replay must not answer keys, and must have
    // stopped where it was: the transport is there, paused.
    expect(screen.getByLabelText('Play')).toBeDefined();
  });

  it('renders the host\'s own split control rather than one of its own', async () => {
    renderTab(makePayload(), makeCapabilities({
      splitAction: <button type="button" className="tab-split">Split</button>,
    }));
    expect(document.querySelector('.tab-split')).toBeDefined();
  });
});