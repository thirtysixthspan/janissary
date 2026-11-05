import { describe, expect, it } from 'vitest';
import { acpLaunchFor, acpLaunchForEntry } from './launch.js';

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
  it('launches an opencode entry exactly as an opencode persona', () => {
    expect(acpLaunchForEntry({ harness: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', effort: 'medium' }))
      .toEqual(acpLaunchFor({ harness: 'opencode', model: 'opencode-go/deepseek-v4.1-flash', variant: 'medium' }));
  });

  it('launches a claude entry with its model and effort', () => {
    expect(acpLaunchForEntry({ harness: 'claude', model: 'claude-haiku-4-5', effort: 'high' })?.env)
      .toEqual({ ANTHROPIC_MODEL: 'claude-haiku-4-5', CLAUDE_THINKING_EFFORT: 'high' });
  });

  it('launches a codex entry through its ACP adapter with config overrides', () => {
    expect(acpLaunchForEntry({ harness: 'codex', model: 'gpt-6-luna', effort: 'high' })).toEqual({
      command: 'npx',
      args: ['@zed-industries/codex-acp', '-c', 'model="gpt-6-luna"', '-c', 'model_reasoning_effort="high"'],
      env: {},
    });
  });

  it('leaves codex’s effort alone when the entry sets none', () => {
    expect(acpLaunchForEntry({ harness: 'codex', model: 'gpt-6-luna' })?.args)
      .toEqual(['@zed-industries/codex-acp', '-c', 'model="gpt-6-luna"']);
  });

  it('has no launch for a harness without an ACP adapter', () => {
    expect(acpLaunchForEntry({ harness: 'gemini', model: 'gemini-3' })).toBeUndefined();
  });
});
