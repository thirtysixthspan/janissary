import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RemoteTargetView } from '@shared/protocol';
import type { ShellPayload } from '@shared/plugins/shell/shared';
import type { TabPluginClientCapabilities } from '../api';
import { ShellTabMeta } from './ShellTabMeta';

const payload: ShellPayload = {
  instanceKey: 'shell-1', ptyId: 'pty1', cwd: '/repo', root: '/repo', workspace: false,
  cols: 80, rows: 24, connections: [], schedule: [], hookNonce: 'a'.repeat(32),
};
const remote: RemoteTargetView = { address: 'ssh://build', host: 'build.example' };

function capabilities(overrides: Partial<TabPluginClientCapabilities> = {}) {
  return {
    label: 'shell-1', active: false, openFileNavigator: vi.fn(), splitAction: null,
    ...overrides,
  } as unknown as TabPluginClientCapabilities;
}

describe('ShellTabMeta remote controls', () => {
  it('shows the host as ordinary text and the detach control for a healthy remote shell', () => {
    const remoteCapabilities = capabilities({
      remote,
      remoteSession: { state: 'active', onAction: vi.fn(async () => true) },
    });
    const { rerender } = render(<ShellTabMeta payload={payload} capabilities={remoteCapabilities} />);

    const host = screen.getByLabelText('Remote');
    expect(host).toHaveTextContent('build.example');
    expect(host).toHaveClass('tab-cwd');
    expect(host).not.toHaveClass('tab-remote-chip');
    expect(host).toHaveAttribute('title', 'Remote: ssh://build');
    expect(host.parentElement).toHaveClass('tab-meta');
    expect(screen.getByRole('button', { name: 'Detach session on build.example' })).toBeInTheDocument();
    const flags = document.querySelector('.tab-flags');
    expect(flags?.querySelector('.connection-plug')).not.toBeNull();
    expect(flags?.querySelector('.tab-recording')).not.toBeNull();
    expect(document.querySelector('.tab-meta > .connection-plug')).toBeNull();

    rerender(<ShellTabMeta payload={payload} capabilities={capabilities()} />);
    expect(screen.queryByLabelText('Remote')).not.toBeInTheDocument();
    expect(document.querySelector('.connection-plug')).toBeNull();
    expect(screen.queryByRole('button', { name: /session on/ })).not.toBeInTheDocument();
  });

  it('offers attach while reconnecting and detach while healthy', () => {
    const reconnecting = capabilities({
      remote,
      remoteSession: { state: 'reconnecting', onAction: vi.fn(async () => true) },
    });
    const { rerender } = render(<ShellTabMeta payload={payload} capabilities={reconnecting} />);
    expect(screen.getByRole('button', { name: 'Attach session on build.example' })).toBeInTheDocument();

    rerender(<ShellTabMeta payload={payload} capabilities={capabilities({
      remote,
      remoteSession: { state: 'active', onAction: vi.fn(async () => true) },
    })} />);
    expect(screen.getByRole('button', { name: 'Detach session on build.example' })).toBeInTheDocument();
  });
});
