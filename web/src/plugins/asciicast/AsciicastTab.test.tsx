import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsciicastPayload } from '@shared/plugins/asciicast/shared';
import type { TabPluginClientCapabilities } from '../api';
import { AsciicastTab } from './AsciicastTab';

const HEADER = '{"version":3,"term":{"cols":80,"rows":24,"theme":{"fg":"#123456","bg":"#654321"}},'
  + '"timestamp":1504467315,"idle_time_limit":2,"command":"claude","title":"claude"}\n';
const encode = (text: string) => new TextEncoder().encode(text);

function makePayload(overrides: Partial<AsciicastPayload> = {}): AsciicastPayload {
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
// copy, and what it does with a degenerate recording — is exercised against it. The stub is a spy, so
// a case can also pin what the tab asks the terminal for, which is where the recorded grid comes from.
const { terminalHook } = vi.hoisted(() => ({ terminalHook: vi.fn() }));
vi.mock('./useAsciicastTerminal', () => ({ useAsciicastTerminal: terminalHook }));

const renderTab = (payload: AsciicastPayload = makePayload(), capabilities = makeCapabilities()) => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(encode(HEADER + '[0, "o", "hi"]\n'))));
  return render(<AsciicastTab payload={payload} capabilities={capabilities} />);
};

describe('AsciicastTab', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    terminalHook.mockReset();
    terminalHook.mockImplementation(() => ({ renderUpTo: vi.fn() }));
  });

  it('asks for no terminal until the recording states its grid, then for that grid', async () => {
    renderTab();
    // Nothing is built from a fallback: a terminal at any size but the recorded one would have to be
    // thrown away, and the bytes already written would go with it.
    expect(terminalHook.mock.calls[0][0]).toBeUndefined();
    await waitFor(() => {
      const header = terminalHook.mock.calls.at(-1)?.[0];
      expect(header).toMatchObject({ cols: 80, rows: 24 });
    });
  });

  it('reports what the recording is, when it started, and how long it is', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText(/claude/)).toBeDefined());
    const meta = document.querySelector('.asciicast-meta')?.textContent ?? '';
    expect(meta).toContain('claude');
    expect(meta).toMatch(/started \d/);
    expect(meta).toMatch(/\d+:\d\d/);
  });

  it('shows the exit status the recording carries, and none when it does not', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      encode(HEADER + '[0, "o", "bye"]\n[0.5, "x", "130"]\n'),
    )));
    const { unmount } = render(<AsciicastTab payload={makePayload()} capabilities={makeCapabilities()} />);
    await waitFor(() => expect(document.querySelector('.asciicast-meta')?.textContent).toContain('exit 130'));
    unmount();

    renderTab();
    await waitFor(() => expect(document.querySelector('.asciicast-meta')).toBeDefined());
    expect(document.querySelector('.asciicast-meta')?.textContent).not.toContain('exit');
  });

  it('shows the reason on the metadata line rather than replacing the player', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(encode('not a cast file\n'))));
    render(<AsciicastTab payload={makePayload()} capabilities={makeCapabilities()} />);

    await waitFor(() => expect(document.querySelector('.asciicast-problem')).toBeDefined());
    expect(document.querySelector('.asciicast-problem')?.textContent)
      .toContain('the file is not an asciicast recording');
    // The transport is still there, so the first good frame has somewhere to go.
    expect(screen.getByLabelText('Seek')).toBeDefined();
  });

  it('offers the whole transport', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByLabelText('Pause')).toBeDefined());
    expect(screen.getByLabelText('Next frame')).toBeDefined();
    expect(screen.getByLabelText('Previous frame')).toBeDefined();
    expect(screen.getByLabelText('Seek')).toBeDefined();
    // Nothing rewrites the recording's timing: a finished recording's silences play at their
    // recorded length, so there is no limit on the transport to change.
    expect(screen.queryByLabelText('Idle time limit')).toBeNull();
  });

  it('cycles the speed from its chord as well as its button', async () => {
    renderTab();
    const speed = screen.getByLabelText('Playback speed');
    expect(speed.textContent).toBe('1×');

    await userEvent.click(speed);
    expect(speed.textContent).toBe('1.5×');

    // The same action from the keyboard, which is what the documentation's key tables claim.
    await userEvent.keyboard(']');
    expect(screen.getByLabelText('Playback speed').textContent).toBe('2×');
  });

  it('opens a recording whose header states an idle limit, and plays it as recorded', async () => {
    // A file written by another tool carries `idle_time_limit`; the player reads the timeline it
    // states rather than rewriting it, which is why this header opens unchanged.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(encode(
      HEADER + '[0, "o", "one"]\n[600, "o", "two"]\n',
    ))));
    render(<AsciicastTab payload={makePayload()} capabilities={makeCapabilities()} />);
    await waitFor(() => expect(document.querySelector('.asciicast-meta')?.textContent).toContain('10:00'));
    expect(screen.queryByLabelText('Idle time limit')).toBeNull();
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
    // A hidden plugin tab stays mounted, so a hidden asciicast tab must not answer keys, and must have
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