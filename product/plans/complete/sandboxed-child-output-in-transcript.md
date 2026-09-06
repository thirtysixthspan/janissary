# Capture sandboxed child output into the initiating transcript

**Complexity: 5/10** — no new architecture, but the change reaches four seams: the ACP subprocess, the e2e browser child, the harness manager's notification path, and the remote frame that carries a browser failure across the ssh transport.

## Goal

When Janissary spawns a harness or a browser into a sandbox on a tab's behalf, the child's own diagnostics reach the tab that initiated it. Today they do not:

- `connectAcp` (`src/acp/index.ts`) spawns the ACP harness binary with `stdio: ['pipe', 'pipe', 'pipe']` and never reads `stderr`. Everything the agent says about why it failed — an authentication error, a version mismatch, instructions for restarting the session — is discarded, and the tab's transcript shows only `ACP: ACP agent exited.` The unread pipe is also a stall risk: a chatty agent that fills the 64 KB pipe buffer blocks on its next write.
- `spawnBrowserChild` (`src/browser/e2e-server.ts`) spawns the confined Chromium host with `stdio: 'ignore'`, so Playwright's launch error, a `sandbox-exec` profile error, or a bind failure is gone before anyone sees it. The user gets `e2e browser exited` and nothing else.
- That message then goes only to the notifications tab (`notify(..., 'e2e-browser-gone', ...)`). A user with that tab closed sees nothing at all, and the agent working in the `-b` tab never learns its browser died.
- A harness tab has nowhere else it lands. `web/src/AppCenterActionArea.tsx` returns no body for a `harness` view, so the tab is rendered entirely by `HarnessTab`, which draws the meta row, an exited/`provisionError` band, and the PTY. Nothing renders `tab.log`, which is why appending there is not the answer — see Approach.
- The remote path drops the message outright: `serve-processes.ts` sends a bare `{ type: 'browser-exited', id }`, and `RemoteManager.notifyBrowserGone` substitutes a fixed string.

After this change the cause travels with the failure, and the failure lands in the initiating tab's transcript as well as the notifications tab.

## Approach

Add one focused module, `src/child-output.ts`, that watches a child's output streams and keeps a bounded tail of what they said. It reads through `readable`/`read()` rather than `data`, so the tail can be drained synchronously at the moment a failure is reported — a child's exit and the last of its output are separate events, and the report must not become asynchronous just to wait for the second one. Attaching the reader also drains the pipe, which is what removes the stall risk.

The tail is bounded twice, by characters and by lines, so a child that spews before dying cannot flood a transcript entry.

Each of the three failure paths then composes its existing message with the tail through one shared helper, so the wording stays exactly what it is today when the child said nothing.

For the browser, the tail belongs on `E2ESession` — it is part of what a launch acquired, and `stopSession` is the single place every "gone" message passes through, so composing it there covers the child exit, the child that never starts, the guard that dies, and the scratch allocation that fails, without four call sites repeating it.

For the harness manager, `onBrowserGone` gains a second delivery. Not an append to `tab.log` — nothing renders that on a harness tab, so it would be a delivery in name only. Not a write into the terminal either: the harness's next repaint paints over anything not drawn by the harness itself. It goes on `HarnessView` as `browserError` and is rendered by `HarnessTab` in a band above the terminal, which is exactly how `provisionError` already reports a failed workspace clone. Unlike that one the tab is not then closed, because the harness is unaffected — only its browser is gone.

For the remote path, `browser-exited` gains an optional `message` field carrying what the far side composed, decoded with the same `optionalNonEmptyString` guard `workspace-ready`'s `notice` uses. The local side reports that message when present and falls back to its current fixed string when absent.

## Implementation steps

1. Add `src/child-output.ts`: `childOutputTail()` returning `{ watch, text }`, plus `withChildOutput(message, tail)` which returns `message` unchanged when the tail is empty and `message` followed by the tail otherwise. Bound the retained text by characters and by lines.
2. `src/acp/index.ts` — watch `proc.stderr` and compose both the spawn-error and exit messages through `withChildOutput`.
3. `src/browser/e2e-session.ts` — give `E2ESession` an `output` tail created in `newSession`, and compose `stopSession`'s message through `withChildOutput` before it reaches `onGone`.
4. `src/browser/e2e-server.ts` — spawn the child with `stdio: ['ignore', 'pipe', 'pipe']` and watch both streams.
5. `src/tab/types.ts` — add `browserError` to `HarnessView`; `web/src/harness/HarnessTab.tsx` and `web/src/theme.css` — render it above the terminal, keeping its line breaks.
6. `src/harness/manager.ts` — route `onBrowserGone` through a private method that notifies as before and also sets `browserError` on the tab's harness view.
7. `src/remote/protocol.ts`, `src/remote/frame-decode.ts`, `src/remote/serve-processes.ts`, `src/remote/manager.ts` — carry the message on the `browser-exited` frame and use it locally when present, reporting it the same two ways.

Step 6 pushes `src/harness/manager.ts` past the 200-line limit, so it also extracts `src/harness/launch-dir.ts`: the `parseDir`/`resolveCwd` pair, which both launch surfaces call composed and never separately, merged into one `resolveLaunchDir(managers, workspace, label, fallbackCwd)`. Extraction rather than compaction is what [`ai/guidelines/code-guidelines.md`](../../../ai/guidelines/code-guidelines.md) requires, and where a harness tab starts on disk is a different question from the command handling and tab wiring the manager owns. The behavior is unchanged; the module gets its own tests, which also close a gap — the workspace-creation error branch had none.

## Tests

- `src/child-output.test.ts`: captures what a stream emits; returns an empty tail for a stream that said nothing; caps by characters and by lines, keeping the newest; tolerates a stream error and an absent stream; drains synchronously at `text()`; `withChildOutput` leaves a message untouched for an empty tail.
- `src/acp/index.test.ts`: a stub agent that writes to stderr and exits reports its stderr text in the `ACP agent exited.` message; the existing silent-exit case still reports the bare message.
- `src/browser/e2e-server-lifecycle.test.ts`: a child that exits after writing to stderr reports that text through `onGone`; a child that says nothing reports the message unchanged; a guard failure carries the child's output too.
- `src/browser/e2e-server-launch.test.ts`: the child is spawned with piped stdout and stderr rather than `ignore`.
- `src/harness/manager-browser.test.ts`: a browser reported gone puts the message on the tab's harness view as well as notifying, does not append it to the tab's log, and leaves the tab running and open; nothing is set before a browser is gone.
- `web/src/harness/HarnessTab.test.tsx`: the report is drawn above the terminal rather than in place of it, keeps its own line breaks, and is absent while the browser is fine.
- `src/harness/launch-dir.test.ts`: the fallback cwd is taken without creating a workspace; a clone in flight comes back as its directory plus its promise; the clone is named under the label given; a workspace that cannot be created returns its error string.
- `src/remote/protocol.test.ts`: `browser-exited` round-trips with and without a message, and rejects an empty one.
- `src/remote/serve-processes-browser.test.ts`: the remote sends the message it was given.
- `src/remote/manager.test.ts`: the local side reports the remote's message when present and its fixed string when absent, puts it on the tab's harness view, and reports nothing on a tab the frame does not name.
- Run `./scripts/run.mjs check-diff` after each step.

## Out of scope

- Streaming a child's output live into a tab. Only the tail at the moment of failure is captured; a healthy child's chatter is still discarded.
- The workspace clone's `git clone`, which also spawns with `stdio: 'ignore'`. It is not a harness or a browser and it already reports an exit code.
- Changing where notifications go, which events are eligible, or the notifications tab itself.
- Bumping the remote protocol version. The new field is optional and the handshake already requires both ends to match exactly.
- Adding `e2e-browser-gone` to the event list in `product/specs/notifications.md`. It was never listed there, and the `-b` section of `product/specs/harness.md` is where that behavior is specified; the omission predates this change.
- The sandbox/auto-approve notice `finishSpawn` appends to a harness tab's log, which nothing renders either. That is the same invisibility, found while placing this report, but it is a separate defect on a separate message and belongs in the backlog rather than in this change.
- Any change to the browser guard, the sandbox profiles, or what the two browser environment variables are.
