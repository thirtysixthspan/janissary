import { describe, it, expect, vi } from 'vitest';
import type { AcpSession } from '../types.js';

const mocks = vi.hoisted(() => ({
  connectAcp: vi.fn(),
}));

vi.mock('../acp/index.js', () => ({
  connectAcp: mocks.connectAcp,
}));

import { spawnMonitorSession } from './acp.js';
import type { Persona } from '../personas.js';

function makePersona(harness: 'opencode' | 'claude', tools: string[] = []): Persona {
  return {
    name: 'test',
    harness: { harness, model: 'test-model', variant: 'default' },
    body: 'test body',
    tools,
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

  it('forwards persona.tools as allowedTools for the opencode branch', () => {
    mocks.connectAcp.mockReturnValue(makeSession());
    spawnMonitorSession(makePersona('opencode', ['web_search']), '/tmp', { onError: vi.fn() });
    expect(mocks.connectAcp).toHaveBeenCalledWith(expect.objectContaining({ allowedTools: ['web_search'] }));
  });

  it('forwards persona.tools as allowedTools for the claude branch', () => {
    mocks.connectAcp.mockReturnValue(makeSession());
    spawnMonitorSession(makePersona('claude', ['web_search', 'web_fetch']), '/tmp', { onError: vi.fn() });
    expect(mocks.connectAcp).toHaveBeenCalledWith(expect.objectContaining({ allowedTools: ['web_search', 'web_fetch'] }));
  });

  it('forwards an empty allowedTools for a tool-less persona', () => {
    mocks.connectAcp.mockReturnValue(makeSession());
    spawnMonitorSession(makePersona('claude'), '/tmp', { onError: vi.fn() });
    expect(mocks.connectAcp).toHaveBeenCalledWith(expect.objectContaining({ allowedTools: [] }));
  });
});
