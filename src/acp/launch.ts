import type { PersonaHarness } from '../persona-parsing.js';
import type { RoleEntry } from '../plugins/roles/shared.js';
import { BUNDLED_ACP_ADAPTERS } from './bundled-adapters.js';
import { internalToolDenial } from './internal-tools.js';

export const MARKDOWN_INSTRUCTION = 'Write your replies in GitHub-flavored Markdown (headings, lists, tables, fenced code blocks, etc.); the tab renders them as formatted Markdown.';

export type AcpLaunch = {
  command: string;
  args: string[];
  env: Record<string, string>;
  sessionMeta?: Record<string, unknown>;
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

// A role entry's launch. OpenCode launches as an opencode persona does. Claude and codex run the ACP
// adapters bundled with Janissary by their `bin` name, which `locateAcpCommand` finds in the install's
// `node_modules/.bin`. Codex takes its model and effort through `CODEX_CONFIG`, because its adapter
// ignores argv. Every role entry also carries the internal-tool denial for its harness, which turns
// the harness's built-in tools off. A harness with no ACP adapter answers undefined, which the caller
// reports as that entry failing.
export function acpLaunchForEntry(entry: RoleEntry): AcpLaunch | undefined {
  const base = baseLaunchForEntry(entry);
  if (base === undefined) return undefined;
  const denial = internalToolDenial(entry.harness, base.env);
  return {
    ...base,
    env: { ...base.env, ...denial?.env },
    ...(denial?.sessionMeta !== undefined && { sessionMeta: denial.sessionMeta }),
  };
}

function baseLaunchForEntry(entry: RoleEntry): AcpLaunch | undefined {
  const variant = entry.effort ?? 'default';
  if (entry.harness === 'opencode') {
    return acpLaunchFor({ harness: entry.harness, model: entry.model, variant });
  }
  if (entry.harness === 'claude') {
    return {
      command: BUNDLED_ACP_ADAPTERS.claude,
      args: [],
      env: { ANTHROPIC_MODEL: entry.model, CLAUDE_THINKING_EFFORT: variant },
    };
  }
  if (entry.harness !== 'codex') return undefined;
  const effort = entry.effort === undefined ? {} : { model_reasoning_effort: entry.effort };
  return {
    command: BUNDLED_ACP_ADAPTERS.codex,
    args: [],
    env: { CODEX_CONFIG: JSON.stringify({ model: entry.model, ...effort }) },
  };
}
