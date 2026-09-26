import { describe, it, expect, vi, afterEach } from 'vitest';
import { HarnessRuntimes } from './runtime-registry.js';
import { messageBus } from '../bus.js';
import type { HarnessRuntime } from './runtime.js';

function runtime(): HarnessRuntime & { dispose: ReturnType<typeof vi.fn> } {
  return { dispose: vi.fn() } as unknown as HarnessRuntime & { dispose: ReturnType<typeof vi.fn> };
}

function exit(id: string): void {
  messageBus.emit('pty', { type: 'exit', id, exitCode: 0 });
}

describe('HarnessRuntimes', () => {
  let runtimes: HarnessRuntimes;

  afterEach(() => {
    runtimes.dispose();
  });

  it('disposes and drops a runtime when its PTY exits', () => {
    runtimes = new HarnessRuntimes();
    const first = runtime();
    runtimes.install('pty-1', 'claude', first);

    exit('pty-1');

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(runtimes.get('pty-1')).toBeUndefined();
  });

  it('disposes the runtime already held under an id before installing its replacement', () => {
    runtimes = new HarnessRuntimes();
    const first = runtime();
    const second = runtime();
    runtimes.install('pty-1', 'claude', first);

    runtimes.install('pty-1', 'claude', second);

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).not.toHaveBeenCalled();
    expect(runtimes.get('pty-1')).toBe(second);
  });

  it('releases every runtime recorded for a closing tab and leaves other tabs alone', () => {
    runtimes = new HarnessRuntimes();
    const first = runtime();
    const second = runtime();
    const other = runtime();
    runtimes.install('pty-1', 'claude', first);
    runtimes.install('pty-2', 'claude', second);
    runtimes.install('pty-3', 'codex', other);

    runtimes.closeTab('claude');

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(other.dispose).not.toHaveBeenCalled();
    expect(runtimes.get('pty-1')).toBeUndefined();
    expect(runtimes.get('pty-2')).toBeUndefined();
    expect(runtimes.get('pty-3')).toBe(other);
  });

  it('ignores a late exit for a runtime its tab close already released', () => {
    runtimes = new HarnessRuntimes();
    const first = runtime();
    runtimes.install('pty-1', 'claude', first);
    runtimes.closeTab('claude');

    exit('pty-1');

    expect(first.dispose).toHaveBeenCalledOnce();
  });

  it('releases everything on dispose and stops listening for exits', () => {
    runtimes = new HarnessRuntimes();
    const first = runtime();
    const second = runtime();
    runtimes.install('pty-1', 'claude', first);
    runtimes.install('pty-2', 'codex', second);

    runtimes.dispose();
    const later = runtime();
    runtimes.install('pty-3', 'opencode', later);
    exit('pty-3');

    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).toHaveBeenCalledOnce();
    expect(later.dispose).not.toHaveBeenCalled();
    expect(runtimes.get('pty-3')).toBe(later);
  });
});
