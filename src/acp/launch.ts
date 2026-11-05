import type { PersonaHarness } from '../persona-parsing.js';
import type { RoleEntry } from '../plugins/roles/shared.js';

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

// A role entry's launch. OpenCode and Claude launch exactly as a persona of that harness does; codex
// runs its ACP adapter with codex's own `-c key=value` config overrides for the model and effort. A
// harness with no ACP adapter answers undefined, which the caller reports as that entry failing.
export function acpLaunchForEntry(entry: RoleEntry): AcpLaunch | undefined {
  const variant = entry.effort ?? 'default';
  if (entry.harness === 'opencode' || entry.harness === 'claude') {
    return acpLaunchFor({ harness: entry.harness, model: entry.model, variant });
  }
  if (entry.harness !== 'codex') return undefined;
  const effort = entry.effort === undefined ? [] : ['-c', `model_reasoning_effort=${JSON.stringify(entry.effort)}`];
  return {
    command: 'npx',
    args: ['@zed-industries/codex-acp', '-c', `model=${JSON.stringify(entry.model)}`, ...effort],
    env: {},
  };
}
