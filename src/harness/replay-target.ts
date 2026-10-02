// What `replay` accepts, resolved to one recording file. Two forms, told apart by the target rather
// than by what happens to exist: a target ending in `.cast` is a path, and anything else is the label
// of a tab that is open right now. One deterministic rule, no filesystem probe, and no label that
// happens to match a filename can win over the label reading.
//
// A recording whose tab has closed is reached by naming the file, not the tab. Resolving a label
// against the recordings directory as well would need the label sanitizing and the filename's
// timestamp parsing to agree with `src/harness/artifact-name.ts` — a second resolution rule with its
// own edge cases, for something a path already says unambiguously.
//
// Kept pure: the two effects it needs — what a label resolves to, and whether a path is there —
// arrive from the caller, so the whole decision is testable without a filesystem.

export type ReplayResolution =
  | { path: string }
  | { error: string };

export type ReplayLookup = {
  // The recording of the open tab with this label, or the refusal naming why there is none: no such
  // tab, a tab that does not record, or a tab that has produced no output yet — which a tab that has
  // just started is genuinely in, and which reads differently from a target that does not exist.
  forLabel(label: string): { path: string } | { error: string };
  // An existing recording file, or the refusal naming the path that is not there.
  forFile(path: string): { path: string } | { error: string };
};

export const REPLAY_USAGE = 'Usage: replay <label|file.cast>.';

export function resolveReplayTarget(target: string, lookup: ReplayLookup): ReplayResolution {
  const trimmed = target.trim();
  if (!trimmed) return { error: REPLAY_USAGE };
  return /\.cast$/iu.test(trimmed) ? lookup.forFile(trimmed) : lookup.forLabel(trimmed);
}
