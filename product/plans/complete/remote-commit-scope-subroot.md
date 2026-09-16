# Scope the remote whole-tree commit to the navigator's own root

**Complexity: 4/10** — one more optional field on an already-flat optional-field protocol bag (the
same shape `policy`/`destination`/`content` already use), one more entry in an existing validation
table (`MUTATION_OPERATIONS['git-commit']`), and reuse of `RemotePortPaths.to`, which already computes
exactly the prefix this needs. No new architecture, no new protocol version.

A file navigator's header **Commit changes to origin** button sends an empty path list for its
whole-tree form, and the far side of a remote session stages that at `context.root` — the workspace
root `RemoteFileNavigators` was constructed with, which is one value shared by every session and
request on that connection, with no per-navigator concept at all. A navigator rooted at a
subdirectory of the workspace (say `<workspace>/src`) still gets `context.root` = the workspace root,
so its whole-tree commit runs `git add -A -- .` at the workspace root and commits and pushes
everything under it — files the tree never showed — while the button reports success. Locally this
cannot happen: `LocalFileSystemPort.commit(root, ...)` always receives the navigator's own root
directly, because a local navigator's `root` field already *is* the tree root. The gap is specific to
the remote wire protocol, where the far side never learns which subtree the browser is showing.

The far side needs to learn it. `RemotePortPaths.to(root, relPath)` already turns a navigator-root-
relative path into a workspace-relative one (`path.posix.relative(workspace, path.posix.resolve(root,
relPath))`) — calling it with an empty `relPath` yields exactly the navigator root's own
workspace-relative prefix (`''` for a navigator rooted at the workspace itself, `'src'` for one rooted
at `<workspace>/src`). Sending that prefix alongside the whole-tree form's empty path list gives the
far side what it is missing, with no new primitive to write.

## Approach

**Wire.** Add `root?: string` to `RemoteFilesystemArguments` in `src/remote/protocol.ts`: the
navigator root's workspace-relative prefix, sent only with `git-commit`'s whole-tree form (an empty
`paths` list). Absent on every other operation and on a named-paths commit, exactly as `policy` is
present only for the operations that take one. This rides the `REMOTE_PROTOCOL_VERSION = 13` bump the
pull request already performs for `git-commit` itself — no new version, just an extra sentence in
that version's comment saying the marker exists and what a version-12 remote (which does not send or
read it) already fails closed on: `git-commit` itself is refused outright by a version-12 peer, so
there is no silent-divergence case to add to the paragraph, only the fact that the field travels with
it.

**Client.** In `remoteGitCommit` (`src/file-navigator/remote-port-git.ts`), when `relPaths` is empty,
derive the prefix with `paths.to(root, '')` and send it as `root` alongside the empty `paths` list.
When `relPaths` is non-empty, send no `root` field at all — the named-paths form already resolves
each path against the workspace correctly today, and does not need a subtree marker.

**Server validation.** `MUTATION_OPERATIONS['git-commit']` in `src/remote/filesystem-operations.ts`
gains the marker in its `valid`/`decode`/`paths` functions, following `optionalPolicy`'s existing
shape for an optional field (a new `optionalRoot` helper in `filesystem-argument-checks.ts`). Marking
it `rootDestination: true` (the flag `read-directory`/`watch`/`move`/... already use) is required, not
cosmetic: the common case — a navigator rooted at the workspace itself — derives an *empty* prefix,
and `refusedPaths` already special-cases an empty candidate as the root itself only for operations
carrying that flag; without it, every whole-tree commit from a root-level navigator would newly be
refused as "outside this file navigator". A prefix that does lexically escape the workspace (a
malformed or malicious marker) is caught the same way every other operation's escaping path already
is: `refusedPaths` runs `containedPath(this.root, candidate)` over it before `run` is ever reached, so
`git-commit`'s `run` closure can trust that a present `args.root` is already contained.

**Server staging.** `git-commit`'s `run` closure computes the effective staging root only for the
whole-tree form: `args.paths` empty and `args.root` present and non-empty means `path.join(context.root,
args.root)`; every other case (named paths, or an empty-string marker meaning the workspace root
itself) keeps `context.root` unchanged. `FileSystemPort.commit`'s signature does not change — the
computed root is simply the `root` argument `context.filesystem.commit` already takes, so
`LocalFileSystemPort.commit` and `commitRoot`/`stage` in `src/git/commit.ts` need no changes at all:
`stage` already scopes an empty path list to `.` under whatever `cwd` it is given, which is exactly
the behavior being extended to a computed subtree instead of only a directly-passed one.

**No spec or documentation change.** `product/specs/file-navigator-tab.md`'s "Committing to origin"
section already says the header button commits "everything under the tree's root" — that sentence
describes the correct, intended behavior this fix restores for the remote case; it was never wrong,
only unmet by the remote implementation. Nothing in `help.md` or `documentation/user-documentation/`
describes the remote wire protocol at this level, so there is nothing to correct there either.

## Implementation steps

1. `src/remote/protocol.ts` — add `root?: string` to `RemoteFilesystemArguments` with a comment
   explaining it is the whole-tree commit's navigator-root marker; extend the version-13 comment.
2. `src/remote/filesystem-argument-checks.ts` — add `optionalRoot`, mirroring `optionalPolicy`.
3. `src/remote/filesystem-operations.ts` — update `MUTATION_OPERATIONS['git-commit']`: `valid` accepts
   an absent-or-string `root`; `decode` carries it through `optionalRoot`; `paths` appends it when
   present; add `rootDestination: true`; `run` computes the effective staging root as described above.
4. `src/file-navigator/remote-port-git.ts` — `remoteGitCommit` derives and sends the prefix via
   `paths.to(root, '')` for the whole-tree form only; update its doc comment, which currently
   (inaccurately) already claims the far side scopes a whole-tree commit to the navigator root.

## Tests

- `src/remote/filesystem-operations.test.ts`: add a `git-commit` row to `PATH_CASES` carrying `root`
  and asserting it is extracted and round-trips through `decode`; add a `git-commit` row to
  `INVALID_CASES` with a non-string `root`; add `'git-commit'` to the expected `rootDestination` list.
- `src/remote/serve-file-navigator.test.ts`: add a `['git-commit', { message: 'x', paths: [],
  root: '../outside' }]` row to the existing "refuses escaping paths as an error for %s, which has no
  failure channel" `it.each` table, and a case (outside that table, since it needs a real file to
  assert against) that a whole-tree commit whose marker names a real subdirectory stages only that
  subdirectory — using a fake `FileSystemPort` to capture the `root` `commit` was called with, the way
  `'stops every watcher on close and dispose'` already substitutes a fake port.
- `src/file-navigator/remote-port.test.ts`: add a case that a sub-rooted whole-tree commit
  (`h.port.commit('/remote/ws/src', ..., [])`) sends `root: 'src'` rather than no marker at all,
  alongside the existing root-level whole-tree case, which keeps passing untouched since `toMatchObject`
  does not pin the absence of new fields.

The existing `src/git/commit.test.ts` and `src/file-navigator/manager.test.ts` commit cases are
untouched: this fix stays entirely inside the remote wire-protocol layer and never changes what
`commitRoot`/`stage` or the local manager do with the root and paths they are handed.

## Out of scope

- **Any other remote operation's containment marker.** Every other mutation already resolves its own
  named paths correctly; only the whole-tree commit's *implicit* empty-list-means-root convention was
  missing a way to say which root.
- **Client-side rejection of an escaping marker before it is sent.** The server already refuses one
  the same way it refuses every other escaping path; adding a second, client-side check would be a new
  enforcement point the rest of the protocol does not have, for a case the client cannot actually
  produce through ordinary navigation (a navigator's root is always resolved from a real path inside
  the workspace).
- **`git-pull`.** It already carries no path arguments and always pulls the far side's own workspace
  root; it has no whole-tree/named-paths distinction to get wrong.

## Verification

Automated: `./scripts/run.mjs check-diff` after each step.

Manual: not performed — this is a remote-protocol code path with no accessible remote host in this
environment; the automated loopback tests in `serve-file-navigator.test.ts` and
`file-navigator-refusal-contract.test.ts`'s style are the verification available here.
