import type { ToolCallUpdate, PermissionOption, RequestPermissionOutcome } from '@agentclientprotocol/sdk';

// The web tools a monitoring persona may opt into. Classification and the permission decision live
// here (a pure module) rather than in the ACP connection code, keeping that code small and the
// branchy logic unit-testable.
export type PersonaTool = 'web_search' | 'web_fetch';

// Classify a tool-permission request into a canonical web-tool id, or null when it is not
// confidently one of them (erring toward null keeps the deny boundary safe).
export function classifyTool(toolCall: ToolCallUpdate): PersonaTool | null {
  const title = (toolCall.title ?? '').toLowerCase();
  // web_fetch: `kind: 'fetch'` is unambiguous (retrieve a URL); also accept a title match for
  // adapters that leave `kind` unset.
  if (toolCall.kind === 'fetch' || /web[_ ]?fetch|webfetch/.test(title)) return 'web_fetch';
  // web_search: `kind: 'search'` is ambiguous — a local file/codebase search also reports it — so
  // require a title match; never map a bare `kind: 'search'` to web search.
  if (/web[_ ]?search/.test(title)) return 'web_search';
  return null;
}

// Decide the outcome for a monitor tool-permission request: approve only a classified web tool the
// persona's allowlist includes, choosing the least-privilege allow option (`allow_once`, falling
// back to `allow_always`); deny everything else. An undefined/empty allowlist — every non-monitor
// caller and every tool-less persona — denies unconditionally, exactly as before.
export function decidePermission(
  allowedTools: string[] | undefined,
  toolCall: ToolCallUpdate,
  options: PermissionOption[],
): RequestPermissionOutcome {
  if (!allowedTools || allowedTools.length === 0) return { outcome: 'cancelled' };
  const tool = classifyTool(toolCall);
  if (!tool || !allowedTools.includes(tool)) return { outcome: 'cancelled' };
  const option = options.find((o) => o.kind === 'allow_once') ?? options.find((o) => o.kind === 'allow_always');
  return option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' };
}
