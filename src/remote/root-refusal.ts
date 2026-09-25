// Why a remote host could not settle a project root for a launch, carried by the `root-refused`
// frame. It is structured rather than a sentence because the far side knows neither the tab's name
// nor the host alias the user typed; the local side composes the line from both (see
// `rootRefusalMessage` in `src/launch-name/messages.ts`).
//
// Every kind carries `path`: the folder the refusal is about. For `no-repository-found` that is the
// directory the walk-up started from, for `no-repo-name` the home directory, and for `declined` and
// `clone-failed` the folder the clone would have gone into.
export type RootRefusal =
  | { kind: 'not-found'; path: string }
  | { kind: 'no-repository-found'; path: string }
  | { kind: 'not-repository'; path: string }
  | { kind: 'no-origin'; path: string }
  // `other` is the origin found at `path`; `url` is the launching project's.
  | { kind: 'different-origin'; path: string; other: string; url: string }
  | { kind: 'occupied'; path: string }
  | { kind: 'no-repo-name'; path: string; url: string }
  | { kind: 'declined'; path: string; url: string }
  | { kind: 'clone-failed'; path: string; url: string; reason: string };

export type RootRefusalKind = RootRefusal['kind'];

// Which string fields each kind carries beyond `path`, as data so the decoder checks exactly these
// and an unknown kind is refused rather than guessed at. Keyed by the union, so adding a kind
// without an entry here is a compile error.
export const ROOT_REFUSAL_FIELDS: Record<RootRefusalKind, readonly ('url' | 'other' | 'reason')[]> = {
  'not-found': [],
  'no-repository-found': [],
  'not-repository': [],
  'no-origin': [],
  'different-origin': ['other', 'url'],
  occupied: [],
  'no-repo-name': ['url'],
  declined: ['url'],
  'clone-failed': ['url', 'reason'],
};
