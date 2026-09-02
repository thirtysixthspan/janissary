import { describe, expect, it } from 'vitest';
import { acpLaunchFor } from './launch.js';

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
