// The dock side a plugin's own command argument names, as the counterpart to `dockTab`: bare opens
// the list in the centre, `left` and `right` dock it into that sidebar, and anything else is
// `undefined` so the caller rejects the request rather than guessing a side the user did not name.
// Published through `api.ts` so every dockable list plugin reads one grammar instead of keeping a copy.
export function parseDockArgument(argument: string): 'left' | 'right' | null | undefined {
  const trimmed = argument.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === 'left' || trimmed === 'right') return trimmed;
  return undefined;
}
