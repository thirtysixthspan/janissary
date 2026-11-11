import { describe, expect, it } from 'vitest';
import { acpLaunchFor, acpLaunchForEntry } from './launch.js';
import { CODEX_DENY_ALL } from './internal-tools-test-fixture.js';

describe('acpLaunchFor', () => {
  it('maps opencode to its ACP command and model configuration', () => {
    expect(acpLaunchFor({ harness: 'opencode', model: 'google/gemini', variant: 'default' }))
      .toEqual({
        command: 'opencode',
        args: ['acp'],
        env: { OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: 'google/gemini' }) },
      });
  });

  it('maps claude to its ACP adapter and model environment', () => {
    expect(acpLaunchFor({ harness: 'claude', model: 'claude-sonnet', variant: 'high' }))
      .toEqual({
        command: 'npx',
        args: ['@zed-industries/claude-code-acp'],
        env: { ANTHROPIC_MODEL: 'claude-sonnet', CLAUDE_THINKING_EFFORT: 'high' },
      });
  });
});

describe('acpLaunchForEntry', () => {
  it('launches an opencode entry as an opencode persona with every permission denied', () => {
    const launch = acpLaunchForEntry({ harness: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: 'medium' });

    expect(launch?.command).toBe('opencode');
    expect(launch?.args).toEqual(['acp']);
    expect(JSON.parse(launch?.env.OPENCODE_CONFIG_CONTENT ?? ''))
      .toEqual({ model: 'opencode-go/deepseek-v4.1-flash', permission: 'deny' });
  });

  it('launches a claude entry through the bundled adapter with model and effort env values and no built-in tools', () => {
    expect(acpLaunchForEntry({ harness: 'claude', model: 'claude-haiku-4-5', effort: 'high' })).toEqual({
      command: 'claude-agent-acp',
      args: [],
      env: { ANTHROPIC_MODEL: 'claude-haiku-4-5', CLAUDE_THINKING_EFFORT: 'high' },
      sessionMeta: { claudeCode: { options: { tools: [] } } },
    });
  });

  it('launches a codex entry through the bundled adapter with its config in CODEX_CONFIG', () => {
    const launch = acpLaunchForEntry({ harness: 'codex', model: 'gpt-6-luna', effort: 'high' });

    expect(launch?.command).toBe('codex-acp');
    expect(launch?.args).toEqual([]);
    expect(launch?.env.INITIAL_AGENT_MODE).toBe('read-only');
    expect(JSON.parse(launch?.env.CODEX_CONFIG ?? ''))
      .toEqual({ model: 'gpt-6-luna', model_reasoning_effort: 'high', ...CODEX_DENY_ALL });
  });

  it('leaves codex’s effort alone when the entry sets none', () => {
    const launch = acpLaunchForEntry({ harness: 'codex', model: 'gpt-6-luna' });

    expect(launch?.args).toEqual([]);
    expect(launch?.env.INITIAL_AGENT_MODE).toBe('read-only');
    expect(JSON.parse(launch?.env.CODEX_CONFIG ?? '')).toEqual({ model: 'gpt-6-luna', ...CODEX_DENY_ALL });
  });

  it('has no launch for a harness without an ACP adapter', () => {
    expect(acpLaunchForEntry({ harness: 'gemini', model: 'gemini-3' })).toBeUndefined();
  });
});
