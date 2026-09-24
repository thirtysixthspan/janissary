// Whether a launch label can become a workspace folder. The label is joined onto the workspace base
// and the result is cloned into — or, as a leftover, recursively removed — so it has to name exactly
// one folder directly under that base. Anything that could climb out of it or reach below another
// folder is refused before the path is ever built.

const INVALID_REASON = String.raw`a workspace name must be a single folder name — not empty, "." or "..", and without "/" or "\"`;
const RESERVED = new Set(['', '.', '..']);
const SEPARATORS = ['/', '\\', '\0'];

// Why `label` cannot name one folder directly under the workspace base, or undefined when it can.
export function workspaceLabelError(label: string): string | undefined {
  if (RESERVED.has(label)) return INVALID_REASON;
  if (SEPARATORS.some((separator) => label.includes(separator))) return INVALID_REASON;
  return undefined;
}
