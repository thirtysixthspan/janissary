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
const provisioningPayload: ShellPayload = {
  instanceKey: 'shell-1', cwd: '/repo', root: '/repo', workspace: true, provisioning: true,
  connections: [], schedule: [], hookNonce: 'a'.repeat(32),
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

describe('ShellTabMeta diff button', () => {
  it('offers the diff of this workspace and sends it through the capability', () => {
    const openDiffHere = vi.fn();
    const workspaced = { ...payload, workspace: true };
    render(<ShellTabMeta payload={workspaced} capabilities={capabilities({ openDiffHere })} />);
    const button = screen.getByRole('button', { name: 'Show diff in the workspace' });
    expect(button).toHaveAttribute('title', 'Show diff in the workspace');
    button.click();
    expect(openDiffHere).toHaveBeenCalledTimes(1);
  });

  it('offers no diff button for a shell with no workspace', () => {
    render(<ShellTabMeta payload={payload} capabilities={capabilities()} />);
    expect(screen.queryByRole('button', { name: 'Show diff in the workspace' })).not.toBeInTheDocument();
  });

  // A remote workspace's changes live on the far side, and the button reads them through the tab's
  // own channel rather than through a git on this machine.
  it('offers the diff of a remote workspace too', () => {
    const openDiffHere = vi.fn();
    render(<ShellTabMeta payload={{ ...payload, workspace: true, host: 'build.example' }} capabilities={capabilities({ openDiffHere })} />);
    const button = screen.getByRole('button', { name: 'Show diff in the workspace' });
    expect(button).toBeInTheDocument();
    button.click();
    expect(openDiffHere).toHaveBeenCalledTimes(1);
  });

  it('leaves the diff button inert while the workspace is still landing', () => {
    render(<ShellTabMeta payload={provisioningPayload} capabilities={capabilities()} />);
    const button = screen.getByRole('button', { name: 'Show diff in the workspace' });
    expect(button).toBeDisabled();
  });
});
