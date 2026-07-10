import { describe, it, expect, vi } from 'vitest';
import type { AcpSession } from './types.js';

const mocks = vi.hoisted(() => ({
  connectAcp: vi.fn(),
}));

vi.mock('./acp.js', () => ({
  connectAcp: mocks.connectAcp,
}));

import { spawnMonitorSession } from './monitor-acp.js';
import type { Persona } from './personas.js';

function makePersona(harness: 'opencode' | 'claude'): Persona {
  return {
    name: 'test',
    harness: { harness, model: 'test-model', variant: 'default' },
    body: 'test body',
  };
}

function makeSession(): AcpSession {
  return { prompt: vi.fn(), kill: vi.fn() };
}

describe('spawnMonitorSession', () => {
  it('connects with opencode command when harness is opencode', () => {
    const session = makeSession();
    mocks.connectAcp.mockReturnValue(session);
    const persona = makePersona('opencode');
    const hooks = { onError: vi.fn() };

    const result = spawnMonitorSession(persona, '/tmp', hooks);

    expect(mocks.connectAcp).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'opencode',
        args: ['acp'],
        cwd: '/tmp',
        onError: hooks.onError,
      }),
    );
    expect(result).toBe(session);
  });

  it('connects with npx claude command when harness is claude', () => {
    const session = makeSession();
    mocks.connectAcp.mockReturnValue(session);
    const persona = makePersona('claude');
    const hooks = { onError: vi.fn() };

    const result = spawnMonitorSession(persona, '/tmp', hooks);

    expect(mocks.connectAcp).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'npx',
        args: ['@zed-industries/claude-code-acp'],
        cwd: '/tmp',
        onError: hooks.onError,
      }),
    );
    expect(result).toBe(session);
  });

  it('passes onConnect hook when provided', () => {
    mocks.connectAcp.mockReturnValue(makeSession());
    const persona = makePersona('opencode');
    const onConnect = vi.fn();
    const hooks = { onError: vi.fn(), onConnect };

    spawnMonitorSession(persona, '/tmp', hooks);

    expect(mocks.connectAcp).toHaveBeenCalledWith(
      expect.objectContaining({ onConnect }),
    );
  });

  it('sets OPENCODE_CONFIG_CONTENT env for opencode harness', () => {
    mocks.connectAcp.mockReturnValue(makeSession());
    const persona = makePersona('opencode');
    persona.harness.model = 'gpt-4';

    spawnMonitorSession(persona, '/tmp', { onError: vi.fn() });

    expect(mocks.connectAcp).toHaveBeenCalledWith(
      expect.objectContaining({
        env: { OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: 'gpt-4' }) },
      }),
    );
  });

  it('sets ANTHROPIC_MODEL and CLAUDE_THINKING_EFFORT for claude harness', () => {
    mocks.connectAcp.mockReturnValue(makeSession());
    const persona = makePersona('claude');
    persona.harness.model = 'claude-sonnet-4-20250514';
    persona.harness.variant = 'high';

    spawnMonitorSession(persona, '/tmp', { onError: vi.fn() });

    expect(mocks.connectAcp).toHaveBeenCalledWith(
      expect.objectContaining({
        env: { ANTHROPIC_MODEL: 'claude-sonnet-4-20250514', CLAUDE_THINKING_EFFORT: 'high' },
      }),
    );
  });
});
