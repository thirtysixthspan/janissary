# Non-blocking harness (and workspace-agent) open/close

**Complexity: 6/10** — no new protocol/RPC surface (state broadcast already exists) and every
mechanism reused is already in the codebase, but real concurrency reasoning is required (cancelling
an in-flight clone on a race with tab close, guarding a deferred PTY-attach against a tab that no
longer exists) across two independent launch paths (`harness -w` and `agent --workspace`) that share
one manager, touching six-plus files on the server and one on the client.

## Summary

Launching a harness or agent tab with `-w`/`--workspace` currently blocks the entire app while its
workspace clone runs, because `createWorkspace()` (`src/workspace.ts`) runs `git clone` and its
companion git commands via synchronous `execSync` calls, which block Node's single-threaded event
loop for the whole duration of the clone — freezing every other tab, every other connected client,
and even unrelated commands like closing a different tab, until the clone finishes. This plan makes
workspace creation asynchronous so the app stays responsive during a `-w`/`--workspace` launch: the
new tab appears immediately, the clone runs in the background, and the tab becomes fully usable once
it's ready — while other tabs and commands keep working the entire time. Closing a tab whose
workspace is still being provisioned cancels the clone and closes the tab immediately, matching the
"the tab closes immediately" guarantee the app already makes for a fully-launched harness tab.

## Design decisions

1. **A harness tab launched with `-w` appears immediately as an empty placeholder** — no terminal
   content and no status text — the moment `harness <name> -w` is submitted. The real PTY terminal
   attaches once workspace cloning and the harness process finish. This mirrors the existing
   guarantee that a harness tab "launches immediately," extended to also hold for the `-w` case,
   where today it does not.
2. **An `agent --workspace` tab is created immediately too, marked busy, and interactive right
   away.** It carries no new "setting up workspace" transcript line — it simply starts busy, exactly
   like any other busy agent tab, and any command typed while the clone runs is queued via the
   existing per-tab command queue (`product/specs/agent-command-queue.md`) rather than run
   immediately. The tab goes idle once the clone finishes and its session is connected. Note:
   `ProfileManager.placeAgent` (`src/profile/manager.ts:71-82`) currently has **no** busy-marking
   call at all for a freshly created agent tab — `managers.tab.addBusy(...)` is not called anywhere
   in that function today (verified; contrast `HarnessManager.spawnTab`, which does call
   `addBusy` at `src/harness/manager.ts:157`). This decision requires *adding* that call for the
   `--workspace` path, not just relying on something that already fires.
3. **Closing a tab whose workspace clone is still in flight cancels the clone and closes the tab
   immediately** — it never waits for the clone to finish. This matches the spec's existing
   "the tab closes immediately" behavior for a fully-launched harness/agent tab with a workspace.
4. **If the clone fails after the tab was already created, the error is surfaced and the tab then
   closes automatically after a brief, fixed delay** (long enough to read a one-line error) — for a
   harness tab, the error is shown in the placeholder area in place of the empty state; for an agent
   tab, it's appended as a single system-style transcript line. No tab is left open indefinitely in
   a broken state.
5. **This plan fixes both `harness <name> -w` and `agent --workspace` together**, since both call
   the same blocking `createWorkspace()` function — it is one shared root-cause fix, not two
   separate features, even though the backlog entry names only "harnesses."

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Proof that deferred, non-blocking cleanup already works for this exact subsystem | Workspace removal on close deferred via `setTimeout(..., 0)` specifically so close isn't blocked | `src/tab/cleanup.ts:13-19` |
| "Tab exists, not fully ready yet" without a new concept | Per-tab busy state + command queue (commands typed while busy are queued, not run) | `product/specs/agent-command-queue.md`; `src/tab/manager.ts` (`addBusy`) |
| "Newly launched tab starts busy" precedent for the harness dot | Busy/ready status — "a newly launched harness tab starts busy... until its first capture is classified" | `product/specs/harness.md:227-230` |
| Tab creation + client notification pattern | `insertTabInGroup` followed by `messageBus.emit('state', { type: 'dirty' })` | `src/harness/manager.ts`, `src/tab/manager.ts` |
| Proof that killing the underlying process is already non-blocking | `entry.session.kill()` is fire-and-forget, does not wait for exit | `src/pseudoterminal-manager.ts:76-77` |
| The actual blocking call this plan removes | Four back-to-back `execSync` calls (`git remote get-url`, `git clone`, `git remote set-url`, `git config credential.helper`) | `src/workspace.ts:52,74,78,82` |
| An empty/unattached `ptyId` already renders as a blank terminal with no crash or wasted network chatter of consequence | `useXterm`'s effect calls `client.attachPty(ptyId, ...)` (registers an inert map entry under key `''`), sends `ptyResize`/`ptyInput` for that id; server-side `PseudoterminalManager.input`/`resizeOne` do `this.ptys.get(id)?...` (optional chaining, silent no-op for an unknown id); `closeTab(label)` iterates and finds nothing to kill. Verified end to end — no client or transport change is needed to render the "empty placeholder": a harness tab broadcast with `ptyId: ''` already displays as a blank terminal today. | `web/src/useXterm.ts:38,43-44`; `web/src/ws.ts:102-107`; `src/pseudoterminal-manager.ts:35,39-44,76-78` |
| Existing `status`-gated consumers already treat "not `'running'`" correctly, so adding a third status value is safe by construction | `tab.harness?.status !== 'running'` gates on equality-to-`'running'`, never on `=== 'exited'` — a new `'provisioning'` value is silently handled as "not ready" everywhere it's checked today, with zero code changes at these sites | `src/schedule/manager.ts:144` (the `with <prompt>` delivery retry, which already needs exactly this: "not ready yet, retry on a later tick"); `src/commands/send.ts:19` (`send` rejects a non-running harness) |
| An existing "exited" banner is the reusable surface for the failure case, instead of inventing new UI | `HarnessTab.tsx`'s `isExited` check renders a `.harness-exited` div in place of the terminal | `web/src/HarnessTab.tsx:42,55-58` |
| Existing per-manager pattern of delegating a harness concern to a sibling module rather than growing `HarnessManager` inline | `busy-status.ts`, `auto-approve.ts`, `capture-file.ts`, `screen.ts`, `recorder.ts` are all separate modules `HarnessManager` composes | `src/harness/*.ts` (imported at `src/harness/manager.ts:6-10`) |

## Proposed changes

Only three of the four `execSync` calls actually need to move off the event loop. `getRemoteUrl`
(`src/workspace.ts:52`, `git remote get-url origin` run against the **source** repo, not the target
clone) is fast and purely local — no network — and the spec requires its failure to still produce
"no tab is created" (`product/specs/workspaced-agent.md:14`: "If no git repository is found... or
the repository has no `origin` remote, an error is shown and no tab is created"). That check must
stay synchronous, alongside the existing `findRepoRoot` check, so both continue to gate tab creation
exactly as they do today. Only `createWorkspace`'s three remaining calls — the clone itself
(`:74`), the origin rewrite (`:78`), and the credential-helper config (`:82`) — move to the
asynchronous, cancellable phase, since none of them can run before the target directory (which the
clone itself creates) exists, and only the first is genuinely slow.

- **`src/workspace.ts`** — split `createWorkspace` into the existing fast, synchronous validation
  (`findRepoRoot` + `getRemoteUrl`, unchanged) and a new asynchronous continuation covering the
  clone + origin rewrite + credential-helper config + `trustWorkspace` + temp-dir creation, using
  async equivalents of the same git subprocess invocations so none of them block the event loop.
  The clone step exposes a cancellation handle (the underlying child process) so a caller can kill
  it mid-flight instead of only being able to wait for it.
- **`src/workspace-manager.ts`** (43 lines today, plenty of headroom under the 200-line limit) —
  `WorkspaceManager.create(name)` keeps its existing synchronous signature and its existing
  fast-fail behavior (`{ error }` for a missing repo/remote, no tab created — unchanged), but on
  success now returns a provisioning handle synchronously: the already-known target directory
  (`workspacePath(name)`, itself synchronous — the path is just a string, computable before
  anything is cloned into it) plus a `Promise` that resolves once the async continuation above
  finishes, and a `cancel()` that kills the in-flight clone. `WorkspaceManager` tracks in-flight
  handles keyed by tab label (next to its existing `dirs: Set<string>`) so a new
  `WorkspaceManager.cancel(label)` method can be called from tab close without either caller
  (`HarnessManager` or `ProfileManager`) needing its own bookkeeping — this is the single, shared
  owner of the cancellation lookup, resolving where that state lives (see below).
- **`src/harness/manager.ts`** (225 raw lines / ~162 non-blank-non-comment lines today, close to
  the 200-line `max-lines` ESLint limit already) — `open()` and `openFromProfile()`
  (`src/harness/manager.ts:109-125` and `:132-140`) **both** currently resolve `workspace`/
  `entry.workspace` via `resolveCwd` → `managers.workspace.create` *before* `spawnTab` is called at
  all (verified: `resolveCwd` at `:221-224` calls `this.managers.workspace.create(label)`
  synchronously, and both `open()` and `openFromProfile()` call `this.parseDir(this.resolveCwd(...))`
  ahead of their `spawnTab(...)` call) — `openFromProfile` is a real, previously easy-to-miss second
  call site: it's how a `profile launch` harness entry with `workspace: true` reaches the exact same
  blocking code (`src/profile/agent-opener.ts:47`, `openHarnessEntry` → `managers.harness
  .openFromProfile`), and needs the identical restructuring, not just `open()`. For the `-w` case in
  both:
  1. The synchronous repo/remote validation still runs first and can still return an error string
     with no tab created (unchanged behavior).
  2. On success, `spawnTab`'s tab-creation half runs immediately with the target workspace
     directory already known (`workspacePath` is synchronous — see above): insert the tab, call
     `setCwd` with the target directory, call `addBusy`, focus it, and broadcast — but skip the
     `pty.spawn` call and leave `harness.ptyId: ''` and `harness.status: 'provisioning'` (see the
     type change below) until the clone resolves.
  3. The async clone's continuation is registered against that handle. On success: spawn the PTY
     in the now-existing target directory, attach the returned `ptyId`, set `status: 'running'`,
     append the sandbox notice, and broadcast — mirroring today's tail of `spawnTab`
     (`:162-170`) unchanged except for timing. A guard checks the tab still exists (by label) before
     this step, so a close that happened mid-clone can't resurrect a tab already removed. On
     failure: see Failure surfacing below.

  Given the file's current size, extract this new orchestration (the "placeholder now, finish or
  fail later" state machine) into a new sibling module — e.g. `src/harness/workspace-spawn.ts` —
  rather than growing `HarnessManager` inline; `HarnessManager` already delegates equivalent
  harness-specific concerns to sibling modules the same way (`busy-status.ts`, `auto-approve.ts`,
  `capture-file.ts`, `screen.ts`, `recorder.ts` — see "What already exists"), so this follows the
  file's own established shape rather than introducing a new pattern.

  **`HarnessManager.run`/`open` keep their existing synchronous `string | undefined` return
  signature — this is not incidental, it's load-bearing.** `src/command-manager.ts:77-87` already
  records the `harness <name> …` command in the *creator's* transcript synchronously, ahead of
  calling `managers.harness.run(input)` and inspecting its synchronous return for an error
  (`:83-86`) — this is the mechanism behind the spec's guarantee that the launch command "is
  recorded in the creator's transcript... synchronously ahead of the PTY spawn"
  (`product/specs/harness.md:49-52`). That call site needs **no changes**: `run()`/`open()` still
  return synchronously — either a fast validation error (no repo/remote, unchanged) or `undefined`
  once the placeholder tab has been created — with the clone's async continuation firing later,
  off of the handle, never awaited by `command-manager.ts`. Do not make `run`/`open` return a
  `Promise`; that would force `command-manager.ts` to await it, which would reintroduce the exact
  blocking this plan removes.
- **`src/profile/manager.ts`** (83 lines today, room to spare) — `newAgent` (`:35-55`) and
  `placeAgent` (`:71-82`) are restructured the same way: `placeAgent` creates and inserts the agent
  tab immediately with the target workspace directory already set via `setCwd`, and additionally now
  calls `managers.tab.addBusy(resolved)` for the `--workspace` case (a genuinely new call — see
  Design decision 2). The clone proceeds against the returned handle; commands typed while busy
  queue through the existing, unchanged command-queue mechanism (`isBusy`/`enqueue`/`onIdle` —
  `src/tab/manager.ts`). **Decided:** the creator-tab message `out(`Agent "${resolved}" ready...`)`
  currently built and appended synchronously right after `placeAgent` returns (`:51-54`) is deferred
  to fire only once the clone's promise actually resolves — appending it immediately would announce
  "ready" before the workspace exists, which is wrong regardless of the blocking-UI fix. On clone
  failure, this creator-tab line is replaced by an error line instead (`out('Failed to create
  workspace for "…": <message>')`), and the half-created agent tab is closed the same way a
  harness's is (see Failure surfacing).
- **`src/types.ts`** — `HarnessView.status` (`:64`, currently `'running' | 'exited'`) gains a third
  value, `'provisioning'`, used while a `-w` tab's clone is in flight, plus a new optional
  `provisionError?: string` field set only when the clone fails. Verified additive/safe: every
  existing consumer checks equality to `'running'`, never negates against `'exited'` specifically
  (`src/schedule/manager.ts:144`'s `with <prompt>` delivery already retries on "not running" —
  exactly the desired behavior for the provisioning window, with no changes needed there;
  `src/commands/send.ts:19` already rejects `send` to a non-running harness the same way).
- **Cancellation on close** — `src/tab/cleanup.ts`'s `closeTabResources` (`:5-42`) calls
  `managers.workspace.cancel(tab.label)` (the new method above) ahead of its existing deferred
  `managers.workspace.remove(...)` call (`:17-19`, unchanged, still deferred via `setTimeout(...,
  0)`), so a clone still in flight is killed immediately and its partial target directory is then
  cleaned up by the same `remove()` path that already handles a completed workspace — `removeWorkspace`
  (`src/workspace.ts:100-104`) already uses `rmSync(..., { force: true })`, which is safe against a
  partial or even nonexistent directory. `managers.pty.closeTab(tab.label)` (`:24`, unchanged) is
  already safe to call on a tab with no PTY yet — it iterates and finds nothing to kill (verified,
  `src/pseudoterminal-manager.ts:76-78`).
- **Failure surfacing** — a small shared helper (colocated with the new `src/harness/
  workspace-spawn.ts` orchestration, or in `WorkspaceManager` itself) is called when a provisioning
  handle's promise rejects: for a harness tab, it sets `harness.status: 'provisioning'`'s
  counterpart `provisionError` to the error message and broadcasts, then closes the tab after a
  brief, fixed delay (long enough to read a one-line error, e.g. a few seconds) via the same close
  path `closeTab` already uses; for an agent tab, it appends the error as a single system-style
  entry to the creator's transcript (see the `newAgent` decision above — not the new tab's own
  transcript, since the new tab never had one worth reading) and closes the agent tab the same way.
  No tab is left open indefinitely in a broken state.
- **`web/src/HarnessTab.tsx`** — no change is needed to render the "empty placeholder" itself: a
  harness tab broadcast with `ptyId: ''` already renders as a blank, unattached terminal today (see
  "What already exists" — verified end to end through `useXterm`, `ws.ts`, and the server's
  `PseudoterminalManager`), and `useXterm`'s effect already re-runs and re-attaches the moment a
  later state update supplies a real `ptyId` (its dependency array is `[ptyId, client]`,
  `web/src/useXterm.ts:63`). The one real change: extend the existing `isExited` check
  (`:42,55-58`) to also trigger on `harness.provisionError` being set, rendering that message in the
  same `.harness-exited`-style banner in place of "exited (code)", reusing the existing element
  rather than adding a new one.
- **Docs** (implementer follow-up, not this plan's own edit) — `product/specs/harness.md`'s
  "Harness tab data" section (`:155-165`) needs a `provisioning` status paragraph alongside
  `running`/`exited`; `product/specs/workspaced-agent.md`'s creation language (`:10-14`) is
  currently silent on timing — unlike its symmetric close-immediately language elsewhere in the same
  file family (`product/specs/harness.md:84-86`) — and should gain a sentence stating the tab
  appears immediately with the clone running in the background.

## Tests

- `src/workspace.test.ts` — the async clone continuation resolves/rejects without blocking; the
  clone can be cancelled via its returned handle, leaving no partial target directory behind; the
  synchronous `getRemoteUrl`/`findRepoRoot` pre-checks still fail fast with no clone attempted.
- `src/workspace-manager.test.ts` (exists today — extend it, don't create a new file) — `create()`
  still fails synchronously with `{ error }` for a missing repo/remote; on success it returns a
  handle whose target directory matches `workspacePath(name)` immediately, before the promise
  resolves; `cancel(label)` kills an in-flight clone and is a no-op once nothing is pending for that
  label.
- `src/harness/manager.test.ts` (plus the new `src/harness/workspace-spawn.test.ts` if the
  orchestration is extracted, per the file-size note above) — a `-w` launch via `open()` creates and
  broadcasts the tab with `status: 'provisioning'` and `ptyId: ''` before the clone resolves; `ptyId`
  is attached and `status` becomes `'running'` only after; closing the tab mid-clone kills the clone
  and removes the tab without ever spawning a PTY; a rejected clone sets `provisionError` and then
  closes the tab after the fixed delay. Add the identical set of cases for `openFromProfile()`
  (`profile launch` with a `workspace: true` harness entry) — the previously-missed second call site
  that shares `spawnTab`.
- `src/profile/manager.test.ts` — a `--workspace` agent tab is created and marked busy immediately
  (a genuinely new assertion, since `placeAgent` calls no `addBusy` today); a command typed while
  busy is queued, not run; busy clears once the clone resolves; the creator's "ready" transcript line
  is appended only after the clone resolves, not at dispatch time; close-mid-clone and clone-failure
  both mirror the harness cases, including the creator-transcript error-line substitution.
- `src/schedule/manager.test.ts` — a regression case confirming a `with <prompt>` one-shot entry
  attached to a `status: 'provisioning'` harness tab is not delivered yet and retries once `status`
  becomes `'running'`, exercising the already-correct `!== 'running'` gate (`:144`) against the new
  status value.
- `web/src/HarnessTab.test.tsx` — a harness tab with `ptyId: ''`/`status: 'provisioning'` renders
  with no terminal content and no `.harness-exited` banner; the same tab with `provisionError` set
  renders that message in the banner in place of "exited (code)"; a later state update populating
  `ptyId` and `status: 'running'` re-attaches the real terminal (already covered by `useXterm`'s
  existing dependency-array behavior — this test just pins the observable rendering contract).

## Out of scope

- SSH tabs, and any harness or agent launch that does not pass `-w`/`--workspace` — those are
  already immediate today and are untouched by this plan.
- Any workspace operation other than initial creation (e.g. git operations inside an
  already-provisioned workspace).
- A configurable retry or configurable delay for the failure-then-close behavior — a fixed short
  delay only.
- Applying this non-blocking pattern to any other slow synchronous work elsewhere in the codebase —
  only `createWorkspace`'s `execSync` calls are in scope for this plan (three of the four move
  async; `getRemoteUrl`'s stays synchronous by design — see Proposed changes).
- Agent-tab profile-restore entries (`openAgentEntry`, `src/profile/agent-opener.ts:20-30`) — these
  read an already-persisted `state.workspaceDir` and never call `managers.workspace.create`, so they
  never hit the blocking path today and need no change.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff`
- Manual: run `harness claude -w` against a repository whose clone takes several seconds (or is
  artificially throttled); confirm the tab appears immediately as an empty placeholder, other tabs
  and commands keep working during the clone, and the terminal attaches once the clone and process
  spawn finish. Close that tab immediately after launching it (before the clone finishes) and
  confirm it disappears at once with no lingering `git clone` process. Point the launch at a bad
  remote to force a clone failure and confirm the error banner is shown before the tab auto-closes.
  Repeat the launch, mid-clone close, and failure checks for `agent --workspace`, confirming the
  agent tab is busy and queues typed commands during the clone. Also run a profile with a `-w`
  harness entry (`profile launch <name>`) and confirm the same immediate-tab, non-blocking behavior
  for `openFromProfile`, not just the interactive `open()` path.
