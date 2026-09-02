import type { PersonaHarness } from '../persona-parsing.js';

export const MARKDOWN_INSTRUCTION = 'Write your replies in GitHub-flavored Markdown (headings, lists, tables, fenced code blocks, etc.); the tab renders them as formatted Markdown.';

export type AcpLaunch = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

export function acpLaunchFor(harness: PersonaHarness): AcpLaunch {
  if (harness.harness === 'opencode') {
    return {
      command: 'opencode',
      args: ['acp'],
      env: { OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: harness.model }) },
    };
  }
  return {
    command: 'npx',
    args: ['@zed-industries/claude-code-acp'],
    env: {
      ANTHROPIC_MODEL: harness.model,
      CLAUDE_THINKING_EFFORT: harness.variant,
    },
  };
}
