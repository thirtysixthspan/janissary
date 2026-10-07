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
  it('shows the host chip and detach control for a healthy remote shell, but not a local shell', () => {
    const remoteCapabilities = capabilities({
      remote,
      remoteSession: { state: 'active', onAction: vi.fn(async () => true) },
    });
    const { rerender } = render(<ShellTabMeta payload={payload} capabilities={remoteCapabilities} />);

    expect(screen.getByLabelText('Remote')).toHaveTextContent('build.example');
    expect(screen.getByRole('button', { name: 'Detach session on build.example' })).toBeInTheDocument();

    rerender(<ShellTabMeta payload={payload} capabilities={capabilities()} />);
    expect(screen.queryByLabelText('Remote')).not.toBeInTheDocument();
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
