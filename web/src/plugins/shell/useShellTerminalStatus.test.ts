import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { TabPluginClientCapabilities } from '../api';
import { useShellTerminalStatus } from './useShellTerminalStatus';

function makeCapabilities(intent?: unknown) {
  return {
    intent: intent ?? vi.fn(async () => ({ ptyId: 'pty-original', running: true })),
    close: vi.fn(),
    reportFailure: vi.fn(),
  } as unknown as TabPluginClientCapabilities;
}

describe('useShellTerminalStatus', () => {
  it('requests status for the PTY id captured at mount', () => {
    const capabilities = makeCapabilities();

    renderHook(() => useShellTerminalStatus(capabilities, 'pty-original'));

    expect(capabilities.intent).toHaveBeenCalledWith('terminal-status', { ptyId: 'pty-original' });
  });

  it('closes only when the matching generation is no longer running', async () => {
    const intent = vi.fn(async () => ({ ptyId: 'pty-original', running: false }));
    const capabilities = makeCapabilities(intent);
    renderHook(() => useShellTerminalStatus(capabilities, 'pty-original'));

    await act(async () => {});

    expect(capabilities.close).toHaveBeenCalledOnce();
    expect(capabilities.close).toHaveBeenCalledWith({ terminalExited: 'pty-original' });
  });

  it('ignores a status response for a different PTY generation', async () => {
    const intent = vi.fn(async () => ({ ptyId: 'pty-replacement', running: false }));
    const capabilities = makeCapabilities(intent);
    renderHook(() => useShellTerminalStatus(capabilities, 'pty-original'));

    await act(async () => {});

    expect(capabilities.close).not.toHaveBeenCalled();
  });

  it('leaves a matching PTY open while it is still running', async () => {
    const capabilities = makeCapabilities(vi.fn(async () => ({ ptyId: 'pty-original', running: true })));
    renderHook(() => useShellTerminalStatus(capabilities, 'pty-original'));

    await act(async () => {});

    expect(capabilities.close).not.toHaveBeenCalled();
  });

  it('ignores a response after its PTY generation has been cancelled', async () => {
    const intent = vi.fn(async (_name: string, payload: unknown) => {
      const { ptyId } = payload as { ptyId: string };
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
      return { ptyId, running: ptyId === 'pty-original' ? false : true };
    });
    const capabilities = makeCapabilities(intent);
    const hook = renderHook(({ ptyId }: { ptyId: string }) => useShellTerminalStatus(capabilities, ptyId), {
      initialProps: { ptyId: 'pty-original' },
    });

    hook.rerender({ ptyId: 'pty-replacement' });
    await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });

    expect(capabilities.close).not.toHaveBeenCalled();
    expect(intent).toHaveBeenCalledWith('terminal-status', { ptyId: 'pty-replacement' });
  });

  it('reports rejected intents only while the hook is mounted', async () => {
    const failingIntent = async (message: string) => {
      await new Promise<void>((resolve) => { setTimeout(resolve, 0); });

      throw new Error(message);
    };
    const mountedIntent = vi.fn(() => failingIntent('status unavailable'));
    const mountedCapabilities = makeCapabilities(mountedIntent);
    renderHook(() => useShellTerminalStatus(mountedCapabilities, 'pty-mounted'));

    await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });

    expect(mountedCapabilities.reportFailure).toHaveBeenCalledWith('shell terminal-status intent failed');

    const cancelledIntent = vi.fn(() => failingIntent('tab closed'));
    const cancelledCapabilities = makeCapabilities(cancelledIntent);
    const hook = renderHook(() => useShellTerminalStatus(cancelledCapabilities, 'pty-unmounted'));
    hook.unmount();

    await act(async () => { await new Promise<void>((resolve) => { setTimeout(resolve, 0); }); });

    expect(cancelledCapabilities.reportFailure).not.toHaveBeenCalled();
  });
});
