import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AcpOptions, AcpSession } from '../acp/types.js';

const mocks = vi.hoisted(() => ({ connectAcp: vi.fn() }));
vi.mock('../acp/index.js', () => ({ connectAcp: mocks.connectAcp }));

import { ConversationSessions } from './sessions.js';

function session(): AcpSession {
  return { prompt: vi.fn(), kill: vi.fn() };
}

beforeEach(() => { mocks.connectAcp.mockReset(); });

describe('ConversationSessions', () => {
  it('connects lazily and reuses one session per conversation', () => {
    const connected = session();
    mocks.connectAcp.mockReturnValue(connected);
    const sessions = new ConversationSessions();
    const pair = { harness: 'opencode' as const, model: 'google/gemini' };

    expect(sessions.has('first')).toBe(false);
    expect(sessions.session('first', pair, '/tmp/first', { onError: vi.fn() })).toBe(connected);
    expect(sessions.has('first')).toBe(true);
    expect(sessions.session('first', pair, '/tmp/first', { onError: vi.fn() })).toBe(connected);
    expect(mocks.connectAcp).toHaveBeenCalledOnce();
  });

  it('confines each tool-less session to its own workspace', () => {
    mocks.connectAcp.mockImplementation(() => session());
    const sessions = new ConversationSessions();
    const pair = { harness: 'claude' as const, model: 'claude-sonnet' };

    sessions.session('first', pair, '/tmp/first', { onError: vi.fn() });
    sessions.session('second', pair, '/tmp/second', { onError: vi.fn() });

    const options = mocks.connectAcp.mock.calls.map(([value]) => value as AcpOptions);
    expect(options.map(({ cwd, workspaceDir }) => ({ cwd, workspaceDir }))).toEqual([
      { cwd: '/tmp/first', workspaceDir: '/tmp/first' },
      { cwd: '/tmp/second', workspaceDir: '/tmp/second' },
    ]);
    expect(options.every((value) => !Object.hasOwn(value, 'allowedTools'))).toBe(true);
  });

  it('closes only the named conversation', () => {
    const first = session();
    const second = session();
    mocks.connectAcp.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const sessions = new ConversationSessions();
    const pair = { harness: 'opencode' as const, model: 'model' };
    sessions.session('first', pair, '/tmp/first', { onError: vi.fn() });
    sessions.session('second', pair, '/tmp/second', { onError: vi.fn() });

    expect(sessions.close('first')).toBe(true);
    expect(first.kill).toHaveBeenCalledOnce();
    expect(second.kill).not.toHaveBeenCalled();
    expect(sessions.has('second')).toBe(true);
  });

  it('disposes every live session', () => {
    const first = session();
    const second = session();
    mocks.connectAcp.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const sessions = new ConversationSessions();
    const pair = { harness: 'opencode' as const, model: 'model' };
    sessions.session('first', pair, '/tmp/first', { onError: vi.fn() });
    sessions.session('second', pair, '/tmp/second', { onError: vi.fn() });

    sessions.dispose();

    expect(first.kill).toHaveBeenCalledOnce();
    expect(second.kill).toHaveBeenCalledOnce();
    expect(sessions.has('first')).toBe(false);
    expect(sessions.has('second')).toBe(false);
  });
});
