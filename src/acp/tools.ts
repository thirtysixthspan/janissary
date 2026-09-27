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

// Decide the outcome for a tool-permission request.
//
// Two callers exist and they are answered differently. A monitoring persona names the web tools its
// `tools:` line opted into, and a request is approved only when it classifies as one of them; an
// undefined or empty list — every non-monitor caller and every tool-less persona — denies
// unconditionally, exactly as before. A visualization's agent, which has to run the commands that
// acquire the data a web page only describes, asks for `allowEveryTool` instead and is approved the
// least-privilege way whatever the call is. That is the narrowest grant that lets it do its job:
// `allow_once` is still preferred over `allow_always` and over a bare `allow`, so a tool the agent
// offers is never persisted as a standing permission.
//
// Classification is deliberately skipped on the allow-every branch. A shell call is not a web tool
// and the two harness adapters name it differently, so anything that tried to match it by name would
// deny the one request the grant exists for; the agent is already confined to its own workspace by
// the sandbox profile, which is the boundary that does not depend on what a tool is called.
export function decidePermission(
  allowedTools: string[] | undefined,
  toolCall: ToolCallUpdate,
  options: PermissionOption[],
  allowEveryTool = false,
): RequestPermissionOutcome {
  const granted = allowEveryTool
    || (allowedTools !== undefined && allowedTools.length > 0 && includes(allowedTools, toolCall));
  if (!granted) return { outcome: 'cancelled' };
  const option = options.find((o) => o.kind === 'allow_once') ?? options.find((o) => o.kind === 'allow_always');
  return option ? { outcome: 'selected', optionId: option.optionId } : { outcome: 'cancelled' };
}

function includes(allowedTools: string[], toolCall: ToolCallUpdate): boolean {
  const tool = classifyTool(toolCall);
  return tool !== null && allowedTools.includes(tool);
}
