import { describe, expect, it, vi } from 'vitest';
import type { AcpLoopHandlers } from './types.js';
import { guardAcpHandlers } from './guard-handlers.js';

function spyHandlers(): AcpLoopHandlers & { startCommand: ReturnType<typeof vi.fn> } {
  return {
    startTurn: vi.fn(),
    chunk: vi.fn(),
    endTurn: vi.fn(),
    startCommand: vi.fn(),
    ranCommand: vi.fn(),
    finished: vi.fn(),
    error: vi.fn(),
  };
}

describe('guardAcpHandlers', () => {
  it('forwards startCommand and every ranCommand argument while active', () => {
    const handlers = spyHandlers();
    const guarded = guardAcpHandlers(handlers, () => true);
    guarded.startCommand?.('file read a.txt', true);
    guarded.ranCommand('db sqlite query shop SELECT 1', 'refused', false, 'disabled');
    expect(handlers.startCommand).toHaveBeenCalledWith('file read a.txt', true);
    expect(handlers.ranCommand).toHaveBeenCalledWith('db sqlite query shop SELECT 1', 'refused', false, 'disabled');
  });

  it('drops startCommand and ranCommand while inactive', () => {
    const handlers = spyHandlers();
    const guarded = guardAcpHandlers(handlers, () => false);
    guarded.startCommand?.('file read a.txt', true);
    guarded.ranCommand('file read a.txt', 'contents', true);
    expect(handlers.startCommand).not.toHaveBeenCalled();
    expect(handlers.ranCommand).not.toHaveBeenCalled();
  });

  it('does not throw when the wrapped handlers have no startCommand', () => {
    const handlers: AcpLoopHandlers = spyHandlers();
    delete handlers.startCommand;
    const guarded = guardAcpHandlers(handlers, () => true);
    expect(() => guarded.startCommand?.('file read a.txt', true)).not.toThrow();
  });
});
