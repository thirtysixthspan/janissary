import { isRecord } from '../value-guards.js';

// The internal-tool policy for role sessions: the launch configuration that turns each harness's
// built-in tools off where the harness allows it. opencode keeps its tools in the model's list and
// denies every call; claude and codex never offer theirs. Either way the model can only run Janissary
// native commands. A harness with no known configuration answers undefined and is protected by the
// permission-request denial alone.
export type InternalToolDenial = {
  env?: Record<string, string>;
  sessionMeta?: Record<string, unknown>;
};

// Codex features that expose a model-callable tool, all switched off. Confirmed against
// `@openai/codex` 0.164.0 (`codex features list`, and the override list the binary applies to its
// own tool-free structured thread). The first eight are on by default; the last four are off by
// default but a user's `~/.codex/config.toml` could turn them on, and `CODEX_CONFIG` wins.
export const CODEX_DISABLED_FEATURES = [
  'shell_tool',
  'unified_exec',
  'view_image',
  'image_generation',
  'multi_agent',
  'apps',
  'goals',
  'tool_suggest',
  'multi_agent_v2',
  'code_mode',
  'request_permissions_tool',
  'standalone_web_search',
] as const;

// Codex tool switches that are config keys rather than features, from the same tool-free list in
// `@openai/codex` 0.164.0: the plan-update tool and the ask-the-user tool.
const CODEX_DISABLED_TOOLS = {
  update_plan: { enabled: false },
  experimental_request_user_input: { enabled: false },
};

// The role primer's tool-availability lines: one follows the allow-list, the other replaces it.
export const NO_BUILTIN_TOOLS_LINE = 'You have no built-in tools; use only the commands listed here.';
export const NO_TOOLS_LINE = 'You have no tools; answer in prose.';

function parseRecord(json: string | undefined): Record<string, unknown> {
  if (json === undefined) return {};
  const parsed: unknown = JSON.parse(json);
  return isRecord(parsed) ? parsed : {};
}

// opencode 2.2.5 (`@opencode/cli`, not bundled): the config loader turns a top-level string
// `permission` into one `*` deny rule, which fails every tool call without asking. The rule does not
// remove the tools from the model's list. opencode's whole-tool removal check reads the last rule
// matching the tool name, and the bundled browser plugin later adds a narrow `skill: browser` deny
// rule, so `skill` stays offered. No supported config key removes it while that rule is present.
function opencodeDenial(baseEnv: Record<string, string>): InternalToolDenial {
  const config = { ...parseRecord(baseEnv.OPENCODE_CONFIG_CONTENT), permission: 'deny' };
  return { env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(config) } };
}

// `@agentclientprotocol/claude-agent-acp` 0.97.0, `dist/acp-agent.js`: `_meta.claudeCode.options.tools`
// of `session/new` is passed to the SDK `query` as `tools`, and `@anthropic-ai/claude-agent-sdk`
// 0.3.310 `sdk.d.ts` `Options.tools` documents `[]` as disabling all built-in tools.
function claudeDenial(): InternalToolDenial {
  return { sessionMeta: { claudeCode: { options: { tools: [] } } } };
}

// `@agentclientprotocol/codex-acp` 2.3.0, `dist/index.js`: `INITIAL_AGENT_MODE` picks the session's
// agent mode, whose sandbox and approval policy are sent on every turn; `read-only` is sandbox
// `readOnly` without network and approval `on-request`, so approvals still reach the client. The
// parsed `CODEX_CONFIG` is the `config` of `thread/start`, with `features` merged as a nested object.
// `web_search: "disabled"` is the top-level form the `@openai/codex` 0.164.0 binary names. No
// `approval_policy` key is ever set.
function codexDenial(baseEnv: Record<string, string>): InternalToolDenial {
  const base = parseRecord(baseEnv.CODEX_CONFIG);
  const baseFeatures = isRecord(base.features) ? base.features : {};
  const disabled = Object.fromEntries(CODEX_DISABLED_FEATURES.map((name) => [name, false]));
  const config = {
    ...base,
    web_search: 'disabled',
    features: { ...baseFeatures, ...disabled },
    tools: CODEX_DISABLED_TOOLS,
  };
  return { env: { INITIAL_AGENT_MODE: 'read-only', CODEX_CONFIG: JSON.stringify(config) } };
}

export function internalToolDenial(harness: string, baseEnv: Record<string, string>): InternalToolDenial | undefined {
  if (harness === 'opencode') return opencodeDenial(baseEnv);
  if (harness === 'claude') return claudeDenial();
  if (harness === 'codex') return codexDenial(baseEnv);
  return undefined;
}
