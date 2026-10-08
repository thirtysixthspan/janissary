# Abbreviate the paths notifications show, as `$workspace/<name>` or `$root`

**Complexity: 5/10** — no new architecture and no new abstraction: the `$workspace/<name>` rule
already exists twice in the codebase (`workspaceCwdDisplay` in `src/tab/view.ts`, and
`remoteFileNavigatorRoot` in `src/tab/remote-file-navigator-root.ts`) and this change hoists it into
one shared function in `src/paths.ts` and then routes every notification line that embeds a path
through it. What makes it a 5 rather than a 3 is breadth: thirteen source files, eleven test files,
seven functional specs and six user-documentation pages all carry a line whose wording changes, and
every one of them has an assertion or a quoted string that has to move with it. The risk is entirely
coverage — a missed call site still typechecks and still renders, it just renders the long path
again.

## The problem

A notification that names a directory currently names it by its full absolute path:

```
9:15pm davud
Shell "davud" ready on 10.27.1.94. (workspace: /Users/davud/janissary/.janissary/workspace/davud)
9:15pm janus
Removed leftover workspace "davud" on 10.27.1.94 (/Users/davud/janissary/.janissary/workspace/davud) before launching.
```

Both should read the way the tab metadata row already reads:

```
9:15pm davud
Shell "davud" ready on 10.27.1.94. ($workspace/davud)
9:15pm janus
Removed leftover workspace "davud" on 10.27.1.94 ($workspace/davud) before launching.
```

The abbreviation itself is not new — `product/specs/root-path.md` already specifies it, and the
transcript has applied it for some time. It is the *notifications feed* that was never routed
through it, because the lines in question are composed far from the code that owns path display:
`src/launch-name/messages.ts` is a set of pure string builders with no root context, and the two
plugin-launch paths build their `displayDir` from two unrelated places.

## Goal

Every path a notification shows is abbreviated by one rule, in one place:

- a workspace clone reads as `$workspace/<name>` — its own directory name — and a path inside it as
  `$workspace/<name>/<rest>`, local or remote, since a remote clone is a path the local `$root`
  abbreviation could never reach;
- anything else under the launch root reads as `$root/...` (or `~...` off home), through the existing
  `abbreviatePath`;
- a path that is neither stays as it is.

The parenthetical `(workspace: <path>)` on a ready line becomes `(<path>)`: once the path reads
`$workspace/davud`, the `workspace: ` label says the same thing twice.

## Approach

### 1. One shared `$workspace` function

`src/paths.ts` grows `abbreviateWorkspacePath(workspace, target?)` next to `abbreviatePath`, with the
existing comment style. Undefined for an empty workspace or a target that leaves the clone, so a
caller can fall back. `src/tab/view.ts` and `src/tab/remote-file-navigator-root.ts` both become thin
delegations to it — the third copy of this rule is the bug, not the fix — which also removes the
`path.posix`-versus-`path` split between them.

### 2. The launch-name lines

Every path `src/launch-name/messages.ts` receives is one of two things:

- a **workspace clone** — `workspacePath(label)`, on this machine or a remote's, for the cleaned
  notice, the removal-failed refusal, and the already-running refusal. The clone's directory name
  *is* the label, so the line reads `($workspace/<label>)` and the `path` parameter becomes
  redundant: drop it from all three functions and from their callers.
- a **project root the remote just cloned** — for `clonedNotice`. That path is the host's root, and
  the line already names the host, so it reads `$root`. Drop the `path` parameter.

`rootRefusalMessage` is deliberately left alone. Every path it prints is a directory that *failed*
to become that host's root — a missing path, a folder with no `origin`, an occupied home-directory
target, the walk-up directory — so naming any of them `$root` would be a false statement, and it is
precisely the path a user has to go and fix. Abbreviating a refusal's evidence would cost the user
the only actionable thing on the line. The plan records that as the boundary rather than leaving it
implicit.

### 3. The plugin-launch `displayDir`

`src/plugins/launch-tab.ts` builds it from `managers.tab.shorten(clone.dir)` (so `$root/workspace/x`
for a local clone) and `src/plugins/launch-tab-remote.ts` from `remote.cwd()` (so the raw remote
path). Both become `abbreviateWorkspacePath(dir)`, which is exactly what the field's own doc comment
in `src/plugins/api-launch.ts` already promises: *"The clone directory shortened for display, as an
agent launch's ready line shows it."* The bundled shell plugin then renders
`Shell "<label>" ready[ on <host>]. ($workspace/<label>)`.

### 4. The agent ready lines

`src/profile/new-agent.ts` and `src/profile/remote-agent.ts` compose the same parenthetical by
hand, one already abbreviated and one not; both route through the shared function and drop the
`workspace: ` label, so an agent and a shell launched side by side read the same way.

### 5. The file-navigator navigation failure

`Could not navigate to <path>` (`src/file-navigator/manager/ports.ts`) is the last notification line
carrying a raw path. The target goes through the remote navigator's `$workspace/<name>` rule when the
tab is remote and `abbreviatePath` otherwise. The `outside the remote workspace <path>` error text
that can follow it in the same line (`src/file-navigator/navigation.ts`) is abbreviated the same way,
so one notification line is never half-shortened.

## Implementation steps

1. `src/paths.ts` — add `abbreviateWorkspacePath(workspace, target?)`; export it.
2. `src/tab/view.ts` — replace `workspaceCwdDisplay`'s body with a delegation; delete the private
   function.
3. `src/tab/remote-file-navigator-root.ts` — delegate to the shared function.
4. `src/launch-name/messages.ts` — `$workspace/<name>` in `cleanedNotice`,
   `removalFailedRefusal` and `localRunningRefusal`; `$root` in `clonedNotice`; drop all four `path`
   parameters; update the module comment's `<path>` contract.
5. `src/launch-name/local.ts`, `src/launch-name/fail-remote.ts` — update the four call sites; drop the
   now-unused `workspacePath` import and the `dir` local in `clearLeftover`.
6. `src/plugins/launch-tab.ts`, `src/plugins/launch-tab-remote.ts` — `displayDir` through the shared
   function.
7. `src/plugins/shell/launch-tab.ts` — `(<path>)`, no `workspace: ` label.
8. `src/profile/new-agent.ts`, `src/profile/remote-agent.ts` — same shape.
9. `src/file-navigator/manager/ports.ts`, `src/file-navigator/navigation.ts` — abbreviate the
   navigate target and the remote-workspace error text.
10. Run `./scripts/run.mjs check-diff` after each step.

## Tests

New cases:

- `src/paths.test.ts` — `abbreviateWorkspacePath`: the clone itself, a path inside it, a sibling
  with a shared prefix, a target above the clone, an empty workspace, and a workspace given with a
  trailing separator.
- `src/file-navigator/manager/ports.test.ts` (or whichever file already covers
  `makeNavigationPort`): the local target reads `$root/...` and a remote tab's target reads
  `$workspace/<name>/<rest>`.

Updated expectations, each already asserting the exact line and therefore already covering the fix:

- `src/notifications/format.test.ts` — the `launch-workspace-cleaned` and `launch-root-cloned`
  verbatim bodies.
- `src/launch-name/local.test.ts`, `src/launch-name/fail-remote.test.ts` — the four lines and
  `rootRefusalMessage`'s deliberate non-abbreviation.
- `src/plugins/launch-tab.test.ts`, `src/plugins/launch-tab-remote.test.ts` — the `displayDir` the
  ready handler receives.
- `src/plugins/shell/activate.test.ts` — the local and remote ready lines.
- `src/profile/manager.test.ts`, `src/profile/remote-agent.test.ts`, `src/harness/manager.test.ts` —
  the agent ready lines.
- `src/tab/view.test.ts` — unchanged expectations; it is the regression check that hoisting
  `workspaceCwdDisplay` into `paths.ts` changed no behavior.

## Out of scope

- `rootRefusalMessage`'s paths, for the reason above: each one is a directory that failed to become
  the host's root, so `$root` would misname it, and it is the one thing on the line a user can act
  on.
- The `outside the remote workspace <path>` wording itself — only its path is abbreviated; the
  sentence is unchanged.
- `documentation/developer-documentation/tab-plugins.md`, whose sentence describing `displayDir` as
  "the remote workspace path" is made stale by step 6. This task may not edit developer
  documentation; the drift is reported rather than silently left.
- Any path inside `openFile`/`openTab` link targets. Those are click handlers carrying real paths to
  open, not text the user reads; they must stay absolute.