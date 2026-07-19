import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import type { HarnessView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { HarnessTab } from './HarnessTab';

// ---- xterm stubs -----------------------------------------------------------
// xterm relies on canvas/WebGL which jsdom doesn't support. We mock both
// modules and capture the customKeyEventHandler to test key routing logic.

vi.mock('@xterm/xterm', () => {
  const Terminal = vi.fn();
  return { Terminal };
});

vi.mock('@xterm/addon-fit', () => {
  function FitAddon() { return { fit: vi.fn() }; }
  return { FitAddon };
});

// jsdom doesn't include ResizeObserver — stub it via Vitest so no global mutation.
vi.stubGlobal('ResizeObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

// ---- ws stub ---------------------------------------------------------------
const mockClient = {
  send: vi.fn(),
  attachPty: vi.fn(() => () => {}),
  request: vi.fn(),
} as unknown as JanusClient;

// ---- helpers ---------------------------------------------------------------

function makeHarness(overrides: Partial<HarnessView> = {}): HarnessView {
  return { name: 'claude', program: 'claude', ptyId: 'pty-1', status: 'running', ...overrides };
}

function makeKeyEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return { type: 'keydown', shiftKey: false, ctrlKey: false, key: 'a', ...overrides } as KeyboardEvent;
}

// ---- tests -----------------------------------------------------------------

describe('HarnessTab', () => {
  let capturedKeyHandler: ((e: KeyboardEvent) => boolean) | null;

  beforeEach(async () => {
    capturedKeyHandler = null;
    const { Terminal: TerminalMock } = await import('@xterm/xterm');
    vi.mocked(TerminalMock).mockImplementation(function() {
      return {
        loadAddon: vi.fn(),
        open: vi.fn(),
        write: vi.fn(),
        onData: vi.fn(() => ({ dispose: vi.fn() })),
        attachCustomKeyEventHandler: vi.fn(function(fn: (e: KeyboardEvent) => boolean) {
          capturedKeyHandler = fn;
        }),
        focus: vi.fn(),
        dispose: vi.fn(),
        cols: 80,
        rows: 24,
      };
    } as unknown as typeof Terminal);
  });

  it('renders without crashing', () => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" />);
  });

  it('attaches to the PTY stream on mount', () => {
    render(<HarnessTab harness={makeHarness({ ptyId: 'pty-42' })} client={mockClient} label="claude" />);
    expect(vi.mocked(mockClient.attachPty as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      'pty-42',
      expect.any(Function),
    );
  });

  it('key handler returns false (bubble) for Shift+ArrowLeft', () => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" />);
    expect(capturedKeyHandler).not.toBeNull();
    expect(capturedKeyHandler!(makeKeyEvent({ shiftKey: true, key: 'ArrowLeft' }))).toBe(false);
  });

  it('key handler returns false (bubble) for Shift+ArrowRight', () => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" />);
    expect(capturedKeyHandler!(makeKeyEvent({ shiftKey: true, key: 'ArrowRight' }))).toBe(false);
  });

  it.each(['[', '{', ']', '}'])('key handler returns false (bubble) for Cmd+Shift+%s', (key) => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" />);
    expect(capturedKeyHandler!(makeKeyEvent({ metaKey: true, shiftKey: true, key }))).toBe(false);
  });

  it.each(['[', ']'])('key handler returns true (send to PTY) for plain Cmd+%s', (key) => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" />);
    expect(capturedKeyHandler!(makeKeyEvent({ metaKey: true, key }))).toBe(true);
  });

  it('key handler returns true (send to PTY) for Ctrl+C', () => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" />);
    expect(capturedKeyHandler!(makeKeyEvent({ ctrlKey: true, key: 'c' }))).toBe(true);
  });

  it('key handler returns false (bubble) for Ctrl+A', () => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" />);
    expect(capturedKeyHandler!(makeKeyEvent({ ctrlKey: true, key: 'a' }))).toBe(false);
  });

  it('key handler returns true (send to PTY) for Ctrl+Shift+A', () => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" />);
    expect(capturedKeyHandler!(makeKeyEvent({ ctrlKey: true, shiftKey: true, key: 'a' }))).toBe(true);
  });

  it('key handler returns false (bubble) for Ctrl+G', () => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" />);
    expect(capturedKeyHandler!(makeKeyEvent({ ctrlKey: true, key: 'g' }))).toBe(false);
  });

  it('key handler returns true (send to PTY) for Ctrl+Shift+G', () => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" />);
    expect(capturedKeyHandler!(makeKeyEvent({ ctrlKey: true, shiftKey: true, key: 'g' }))).toBe(true);
  });

  it('key handler returns false (bubble) for a regular key when navOpen is true', () => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" navOpen />);
    expect(capturedKeyHandler!(makeKeyEvent({ key: 'a' }))).toBe(false);
  });

  it('key handler returns true (send to PTY) for a regular key when navOpen is false', () => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" navOpen={false} />);
    expect(capturedKeyHandler!(makeKeyEvent({ key: 'a' }))).toBe(true);
  });

  it('key handler returns true for regular keys', () => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" />);
    expect(capturedKeyHandler!(makeKeyEvent({ key: 'Enter' }))).toBe(true);
  });

  it.each(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape'])(
    'key handler returns false (bubble) for %s when taskPickerOpen is true',
    (key) => {
      render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" taskPickerOpen />);
      expect(capturedKeyHandler!(makeKeyEvent({ key }))).toBe(false);
    },
  );

  it('key handler returns true (send to PTY) for a regular key when taskPickerOpen is false', () => {
    render(<HarnessTab harness={makeHarness()} client={mockClient} label="claude" taskPickerOpen={false} />);
    expect(capturedKeyHandler!(makeKeyEvent({ key: 'ArrowUp' }))).toBe(true);
  });

  it('shows an exited banner when status is exited', () => {
    const { getByText } = render(
      <HarnessTab harness={makeHarness({ status: 'exited', exitCode: 1 })} client={mockClient} label="claude" />,
    );
    expect(getByText(/exited \(1\)/)).toBeInTheDocument();
  });

  it('does not show an exited banner while running', () => {
    const { queryByText } = render(
      <HarnessTab harness={makeHarness({ status: 'running' })} client={mockClient} label="claude" />,
    );
    expect(queryByText(/exited/)).not.toBeInTheDocument();
  });

  it('renders no terminal content or banner while provisioning', () => {
    const { queryByText } = render(
      <HarnessTab harness={makeHarness({ status: 'provisioning', ptyId: '' })} client={mockClient} label="claude" />,
    );
    expect(queryByText(/exited/)).not.toBeInTheDocument();
  });

  it('attaches to no real PTY while provisioning (empty ptyId)', () => {
    render(<HarnessTab harness={makeHarness({ status: 'provisioning', ptyId: '' })} client={mockClient} label="claude" />);
    expect(vi.mocked(mockClient.attachPty as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('', expect.any(Function));
  });

  it('shows the provision-error banner in place of the exited banner', () => {
    const { getByText } = render(
      <HarnessTab
        harness={makeHarness({ status: 'provisioning', ptyId: '', provisionError: 'Failed to create workspace: no origin remote' })}
        client={mockClient}
        label="claude"
      />,
    );
    expect(getByText('Failed to create workspace: no origin remote')).toBeInTheDocument();
  });

  it('shows the given cwd in the metadata row', () => {
    const { getByText } = render(
      <HarnessTab harness={makeHarness()} client={mockClient} label="claude" cwd="~/project" />,
    );
    expect(getByText('~/project')).toBeInTheDocument();
  });

  it('renders the workspaced emoji with a tooltip when flags includes workspaced', () => {
    const { getByRole } = render(
      <HarnessTab harness={makeHarness()} client={mockClient} label="claude" flags={['workspaced']} />,
    );
    const badge = getByRole('img', { name: 'Workspaced' });
    expect(badge).toBeInTheDocument();
    expect(badge.querySelector('svg[data-icon="box"]')).not.toBeNull();
    expect(badge).toHaveAttribute('title', 'Workspaced');
  });

  it('renders no flag emoji when flags is empty', () => {
    const { container } = render(
      <HarnessTab harness={makeHarness()} client={mockClient} label="claude" flags={[]} />,
    );
    expect(container.querySelectorAll('.tab-flag').length).toBe(0);
  });

  it('renders both flag emoji when both are present', () => {
    const { getByRole } = render(
      <HarnessTab harness={makeHarness()} client={mockClient} label="claude" flags={['workspaced', 'autoApprove']} />,
    );
    expect(getByRole('img', { name: 'Workspaced' })).toBeInTheDocument();
    expect(getByRole('img', { name: 'Auto-permitting' })).toBeInTheDocument();
  });

  it('renders model and effort chips in order between the cwd and the flags', () => {
    const { container } = render(
      <HarnessTab
        harness={makeHarness({ model: 'opus', effort: 'high' })}
        client={mockClient}
        label="claude"
        cwd="~/project"
        flags={['workspaced']}
      />,
    );
    const meta = container.querySelector('.tab-meta')!;
    const order = [...meta.children].map((el) => el.className);
    expect(order).toEqual(['tab-cwd', 'tab-meta-chip', 'tab-meta-chip', 'tab-flags', 'tab-open-files', 'tab-launch-agent']);
    const chips = meta.querySelectorAll('.tab-meta-chip');
    expect(chips[0]).toHaveTextContent('opus');
    expect(chips[0]).toHaveAttribute('title', 'Model: opus');
    expect(chips[1]).toHaveTextContent('high');
    expect(chips[1]).toHaveAttribute('title', 'Effort: high');
  });

  it('renders only the model chip when effort is unset', () => {
    const { container } = render(
      <HarnessTab harness={makeHarness({ model: 'opus' })} client={mockClient} label="claude" />,
    );
    const chips = container.querySelectorAll('.tab-meta-chip');
    expect(chips.length).toBe(1);
    expect(chips[0]).toHaveAttribute('title', 'Model: opus');
  });

  it('renders only the effort chip when model is unset', () => {
    const { container } = render(
      <HarnessTab harness={makeHarness({ effort: 'high' })} client={mockClient} label="claude" />,
    );
    const chips = container.querySelectorAll('.tab-meta-chip');
    expect(chips.length).toBe(1);
    expect(chips[0]).toHaveAttribute('title', 'Effort: high');
  });

  it('renders no chips when neither model nor effort is set', () => {
    const { container } = render(
      <HarnessTab harness={makeHarness()} client={mockClient} label="claude" />,
    );
    expect(container.querySelectorAll('.tab-meta-chip').length).toBe(0);
  });

  it('dispatches openFileNavigatorFor with the tab label when the metadata button is clicked', () => {
    const { getByTitle } = render(
      <HarnessTab harness={makeHarness()} client={mockClient} label="claude" />,
    );
    vi.mocked(mockClient.send as ReturnType<typeof vi.fn>).mockClear();
    getByTitle('Open file navigator here').click();
    expect(vi.mocked(mockClient.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      method: 'openFileNavigatorFor',
      params: { label: 'claude' },
    });
  });

  it('dispatches launchAgentFor with the tab label when the launch-agent button is clicked', () => {
    const { getByTitle } = render(
      <HarnessTab harness={makeHarness()} client={mockClient} label="claude" cwd="~/project" />,
    );
    vi.mocked(mockClient.send as ReturnType<typeof vi.fn>).mockClear();
    getByTitle('New agent here').click();
    expect(vi.mocked(mockClient.send as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith({
      method: 'launchAgentFor',
      params: { label: 'claude' },
    });
  });

  it('renders no launch-agent button when the tab has no known cwd', () => {
    const { queryByTitle } = render(
      <HarnessTab harness={makeHarness()} client={mockClient} label="claude" />,
    );
    expect(queryByTitle('New agent here')).not.toBeInTheDocument();
  });
});
