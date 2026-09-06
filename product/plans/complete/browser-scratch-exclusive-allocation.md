# Plan: Allocate each e2e browser its own scratch directory exclusively

**Complexity: 4/10** — one new focused module, a three-line change in its only caller, and test updates in three suites. No new architecture: the directory keeps living under `.janissary/workspace/`, keeps being swept at startup, and keeps being removed when the browser stops. What changes is who owns the name and how the name is claimed.

## Goal

A `-b` browser's scratch directory is `workspacePath('<label>.browser')` today — a name derived entirely from a tab label, allocated with `mkdirSync(..., { recursive: true })`, which silently adopts whatever is already at that path, and removed with `removeWorkspace`, which deletes it recursively. Three consequences follow:

- A workspaced tab launched as `harness claude -w as bot.browser` already owns `.janissary/workspace/bot.browser`. A later `harness claude -b as bot` adopts that same live clone as its browser scratch directory, and closing the browser deletes it — uncommitted work included.
- `src/remote/serve-processes.ts` passes `this.label` for every session on a channel, so two browser-enabled sessions sharing one channel are handed the *same* directory. Closing either one deletes the other's live browser profile underneath it.
- Nothing rejects a path-traversing label. `as ../../thing` reaches `path.join` unvalidated, and the browser's own `mkdirSync`/`rmSync` pair then operates outside the workspace root.

The fix is to stop deriving ownership from the label. Each launch allocates a directory it exclusively created, keeps the two exact paths it allocated on its handle, and removes exactly those.

## Approach

Add `src/browser/e2e-scratch.ts`, the allocator, and have `e2e-server.ts` use it instead of its private `browserWorkspace` helper.

**A container the tab-workspace namespace does not reach into.** Browser scratch directories become grandchildren of the workspace root, under a single `browsers/` container, rather than siblings of the tab clones. A tab's own workspace is always `path.join(base, label)` — a direct child — so an ordinary label can no longer name a browser's directory at all. The container is still a direct child of the workspace root, so `clearWorkspaceDir()`'s startup sweep keeps reaching it with no change and no broadened deletion target.

**Exclusive creation, not recursive creation.** The allocation is `mkdirSync(dir)` with no `recursive` flag, which fails with `EEXIST` rather than adopting an existing directory. That, not the name, is what makes the directory this launch's: a path that already exists is never taken over. The name carries an unguessable `makeToken()` suffix, so a fresh draw after `EEXIST` succeeds; the loop is bounded and throws rather than spinning. Both the directory and its `.tmp` sibling are claimed the same way, and a half-claimed pair is rolled back before the next attempt.

**The label is display only, and is sanitised.** The label still prefixes the directory name so a human reading `ls` can tell which tab a directory belongs to, but it no longer decides anything. It is reduced to `[A-Za-z0-9._-]` with every other character mapped to `-`, leading dots and dashes stripped, and the result truncated — which removes path separators and any `..` component by construction, so the allocated path cannot leave the container. An empty result falls back to `browser`.

**The handle removes what it allocated.** `allocateBrowserScratch` returns `{ dir, tempDir, remove }`. `remove()` deletes those two recorded paths and nothing derived at close time. It replaces the `removeWorkspace` call, which was the wrong tool anyway: it consults and rewrites the user's `~/.claude.json` trust list, which a browser scratch directory was never added to.

## Implementation steps

1. Add `src/browser/e2e-scratch.ts` exporting `BrowserScratch` and `allocateBrowserScratch(label)`, with the container name, the bounded attempt count, the slug reduction, the exclusive `claim`, and the `remove` described above.
2. In `src/browser/e2e-server.ts`: drop the `browserWorkspace` helper and the `mkdirSync`, `workspacePath`, `workspaceTempPath`, `removeWorkspace`, and `ensureWorkspaceDir` imports it needed; call `allocateBrowserScratch(options.label)` instead; pass `scratch.dir` where `dir` went, set the child's `TMPDIR` from `scratch.tempDir` rather than by appending `.tmp`, and have `closeHandle` call `scratch.remove()`.
3. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/browser/e2e-scratch.test.ts` (new, against a real temporary workspace root):
  - allocates the directory and its temp sibling, both inside the `browsers/` container and both empty;
  - two allocations for the *same* label get different directories, and removing the first leaves the second's directory and temp sibling intact — the repeated-label and two-live-session case;
  - a pre-existing directory at a candidate path is never adopted: with the container pre-populated, the allocated path is a new one and the pre-existing directory still holds its contents afterwards;
  - a label containing `/` or `..` yields a path inside the container, and a label of `..` alone still allocates a usable directory;
  - a label made entirely of stripped characters still allocates;
  - `remove()` deletes both allocated paths and is safe to call when they are already gone;
  - a tab-shaped sibling directory in the workspace root (`<label>.browser`, the old name) is left untouched by an allocation and by a removal.
- `src/browser/e2e-server.test.ts` — stub `./e2e-scratch.js` instead of `node:fs`/`../workspace/index.js`: the allocator is called with the tab's label; the child's `--dir` and the sandbox `workspaceDir` are the allocated directory; `TMPDIR` is the allocated temp path; `close()` calls the handle's own `remove` once and remains idempotent; `removeWorkspace` is no longer involved.
- `src/remote/serve-processes.test.ts` — two browser-enabled sessions spawned on one channel (same `this.label`) get two distinct handles, and killing one closes only its own; a natural exit of one closes only its own.

## Spec and documentation

`product/specs/harness.md` and `product/specs/sandbox.md` both describe the browser's scratch directory as "fresh and empty for each `-b` tab". That remains true and gains one factual clause: the directory belongs to a single browser, is never shared with a tab's workspace or with another browser, and is removed on its own. No `help.md` or user-documentation change: neither names the directory or its layout, and the user-visible behaviour of `-b` is unchanged.

## Out of scope

- Hardening `workspacePath` itself against a traversing tab label. The label reaches it from every `--workspace` launch, not just this one, and changing it is a separate change with its own blast radius.
- Reusing or pooling a scratch directory across launches, or recovering an orphan left by a crash. The startup sweep already handles the orphan, and pooling is explicitly out of scope for the browser feature.
- The other browser findings recorded in `product/backlog/pull-request.md` — the port draw, the child entry resolution, the loopback address, and the failure-path cleanup each get their own change.
