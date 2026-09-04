# File navigator pull reports its outcome to the notifications tab

**Complexity: 4/10** — the notification path already exists and a failed pull already uses it. What is
missing is the other half: a pull that succeeds says nothing at all, so a user watching the
notifications feed cannot tell a finished pull from a click that never landed. The work is to give
`git pull`'s own outcome somewhere to go — a summary string carried back through `FileSystemPort`
(which means one remote-protocol bump, since the far side now fills a result it previously left
empty) and one `file-operation` line posted on success beside the one already posted on failure.

## Goal

Every click of the file navigator header's **Pull from origin** button records exactly one line in
the notifications tab saying what happened. A pull that succeeds reads
`Pulled from origin: Already up to date.` or `Pulled from origin: 3 files changed, 12 insertions(+),
4 deletions(-)` — git's own outcome, not a generic acknowledgement. A pull that fails keeps the line
it already produces, `Could not pull: <git error>`. A click ignored because a pull is already in
flight stays silent, since nothing happened to report.

Local and remote trees behave identically: the summary comes from whichever host actually ran the
pull.

## Design decisions

**The summary is git's last non-empty stdout line.** `git pull` writes progress to stderr and its
outcome to stdout. When there is nothing to take, stdout is the single line `Already up to date.`;
when there is, stdout ends with the diffstat total (`3 files changed, 12 insertions(+)`). Taking the
last non-empty line gets the most informative sentence in both cases without parsing git's output
format. An empty stdout degrades to the bare `Pulled from origin` rather than an empty suffix.

**`FileSystemPort.pull` returns the summary rather than the manager re-deriving it.** The port is
already the single seam that hides local-vs-remote from `FileNavigatorManager`, and the summary is
only knowable on the host that ran the pull. Widening the return type from `Promise<void>` to
`Promise<string>` keeps that seam intact; the alternative — a local-only summary with a generic
message for remote trees — would put a visible behavior difference on the wrong side of the port.

**The wider result bumps `REMOTE_PROTOCOL_VERSION` to 11.** `src/remote/protocol.ts` states the rule
directly: the version covers what frames *carry*, and "a field one end fills in and the other is
expected to honor is as much a contract as a new frame type." A version-10 remote replies to
`git-pull` with no result at all, so the local side would report `Pulled from origin` for every
remote pull while looking entirely healthy — the exact failure the handshake exists to catch. Version
9 was bumped to introduce this operation; version 11 covers what it now answers with.

**Notification text lives in its own module, both halves together.** `operation-report.ts` is about
batch results (`failedPaths`/`total`) and a pull has neither. A new `pull-report.ts` holds
`pullSuccessText` and `pullFailureText` side by side, so the two lines a pull can produce are written
and tested in one place instead of being inline template literals in the manager.

**Success is one line, not two.** No "pulling…" line is recorded when the pull starts. The
notifications tab is a log of things that happened, and a start line would double every pull's
footprint in it to say something the button itself is better placed to show while it is happening.

## Implementation

1. **`src/git-pull.ts`**: export `pullSummary(stdout: string): string` — split on newlines, trim,
   drop empties, return the last one or `''`. Change `pullRoot` to `Promise<string>`, returning
   `pullSummary(stdout)` from the `execFileAsync` result. The rejection behavior is unchanged.

2. **`src/file-navigator/filesystem-port.ts`**: `pull(root: string): Promise<string>` on the
   `FileSystemPort` interface, with its comment updated to say the resolution carries git's own
   outcome summary. `LocalFileSystemPort.pull` still delegates to `pullRoot`.

3. **`src/file-navigator/remote-port.ts`**: `pull(_root: string): Promise<string>` sending
   `this.request<string>('git-pull', {})`. No defensive fallback — the handshake guarantees a far
   side that answers with a summary.

4. **`src/remote/protocol.ts`**: bump `REMOTE_PROTOCOL_VERSION` to 11 and add the version-history
   paragraph explaining that `git-pull` now answers with git's outcome summary.

5. **`src/file-navigator/pull-report.ts`** (new): `pullSuccessText(summary: string)` returns
   `Pulled from origin: ${summary}` when the summary is non-empty and `Pulled from origin` otherwise;
   `pullFailureText(error: unknown)` returns `Could not pull: ${errorText(error)}`, moving the string
   the manager builds inline today.

6. **`src/file-navigator/manager.ts`**: in `pull`, take the resolved summary and post
   `notify(this.managers, 'file-operation', label, pullSuccessText(summary))` on the success path.
   The notification is posted whether or not the tab survived the pull — the user asked for the pull
   and is owed its outcome even if they re-rooted or closed the tree meanwhile — so it comes before
   the existing tab-still-open guard. The failure path swaps its inline template for
   `pullFailureText(error)`.

## Tests

- **`src/git-pull.test.ts`**: `pullRoot` resolves to `Already up to date.` when that is git's stdout;
  resolves to the trailing diffstat line when stdout has several lines with trailing blanks; resolves
  to `''` for empty stdout; still rejects with git's error. Extend the existing `execFile` mock so a
  test can choose the stdout it answers with.
- **`src/file-navigator/pull-report.test.ts`** (new): success text with and without a summary;
  failure text from an `Error` and from a non-`Error` throw.
- **`src/file-navigator/manager.test.ts`**: a successful pull posts exactly one
  `Pulled from origin: <summary>` line when a notifications tab is open, and posts
  `Pulled from origin` when git said nothing; the existing failure test still sees exactly one line;
  a coalesced second click posts nothing extra. `pullRootMock` becomes `Promise<string>`.
- **`src/file-navigator/remote-port.test.ts`**: `pull` resolves with the summary string the reply
  carries.
- **`src/remote/protocol.test.ts`**: the version-mismatch case that names version 10 as the stale one
  reads correctly against the new constant.

Run `./scripts/run.mjs check-diff` after each step.

## Out of scope

- Any change to the pull button's own appearance while a pull runs. The button showing working,
  success, and failure states is the separate backlog issue about matching the editor's sync
  animation.
- A "pull started" notification, per the design decision above.
- Naming the branch or the tree root in the line. The notification's provenance header already names
  the tab the pull ran in.
- Widening any other `FileSystemPort` method's result, and any change to how `file-operation` events
  are configured, suppressed, or rendered.

## Spec and documentation

- **`product/specs/file-navigator-tab.md`** — the pull paragraph gains the success line beside the
  failure line it already describes.
- **`product/specs/notifications.md`** — the `file-operation` bullet currently lists only failures;
  it gains the successful pull as the one `file-operation` line that reports a success.
- **`documentation/user-documentation/tab-types/file-navigator.md`** — "Pulling the latest from
  origin" already tells the reader a failed pull reports one notifications line; it gains the same
  sentence for a pull that works.
- `help.md` documents the `files` command and its chords only, so it needs no change.
