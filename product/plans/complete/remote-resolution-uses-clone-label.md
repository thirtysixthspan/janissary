# Remote task resolution must pass the clone label, not the returned directory

**Complexity: 2/10** — one production line changes its selector from an absolute path to a label, with two focused tests and one spec paragraph (p=3.75).

## Goal

A remote subagent resolves its task inside the clone it was created in, so the far-side handler can find the clone and the run reaches execution instead of failing task lookup with an unknown-clone error.

## Approach

`src/subagent/launch.ts:66` currently calls `channel.resolveAgentSnapshot(task, [], directory)`, where `directory` is the absolute path resolved by `remote.ready`. That selector travels over the channel as the `workspace` field of an `agent-resolve` frame (`RemoteAgentRequests.request` in `src/remote/channel/agent-requests.ts:20-27`). On the far side, `resolveRemoteAgentRequest` (`src/remote/serve-agent-resolution.ts:8-26`) passes the selector to `RemoteRunClones.lookup`, which returns `undefined` for a path-shaped label (`workspaceLabelError` refuses `/` and `\`; see `src/workspace/label.ts` and `src/remote/serve-run-clones.ts:51-55`). The handler then emits `Unknown remote run clone "<path>".`, so every remote subagent fails before its executor is reached.

The same launch code already uses the clone label `subagent-${run.id}` in two places that do work: `runClone('create', ...)` (via `prepareRemoteSubagentWorkspace`) and the executor's `remote.workspace` option at `launch.ts:74`. Pass that same label as the resolution selector, while leaving `executionDir: directory` untouched so the executor still runs in the returned directory. No far-side code changes: `resolveRemoteAgentRequest` and its real `lookup` already accept a single-folder label through the ready clone registered under that label.

## Implementation steps

1. In `src/subagent/launch.ts`, change the remote-resolution call to `channel.resolveAgentSnapshot(task, [], \`subagent-${run.id}\`)`. Keep `directory` (from `remote.ready`) as `executionDir` on `executeSubagentRun` and as the local-resolution `workspaceDir`. Leave the local-resolution branch, termination checks and executor options unchanged.

## Tests

- `src/subagent/launch.test.ts` — update the existing `resolves remote tasks through the captured channel with the clone label` case to assert `resolveAgentSnapshot` was called with `('task.md', [], 'subagent-' + runId)` rather than the returned `/remote/clone/ws`; keep its executor-options assertion on the returned directory.
- `src/subagent/launch.test.ts` — add a focused case that drives the real `resolveRemoteAgentRequest` handler against a real `RemoteRunClones` lookup: register a ready clone under the label the launcher passes, feed the selector captured from the channel's real `send`/frame path into the handler, and assert a snapshot resolves from that clone. Assert that a path-shaped selector (the previously passed directory) is refused with `Unknown remote run clone "<path>".` so a regression that reverts to the directory is caught. Keep the local-resolution and exact-executor-options cases passing untouched.
- `src/remote/serve-agent-resolution.test.ts` — no new case required; its existing `refuses an unknown or path-shaped selector` case already pins the far-side refusal this fix relies on. Leave it and the real-lookup cases unchanged.

## Spec updates

- `product/specs/subagent.md`, `### Remote clone lifecycle`: change the sentence "resolution and execution then use that returned directory" so it says resolution selects the clone by its label while execution metadata uses the returned directory, and no remote path is inferred or written back onto the run.

## Docs

None. No help page or user-documentation file describes the wire-level resolution selector.

## Out of scope

- The far-side handler, `RemoteRunClones.lookup`, the channel framing, and the decode layer. They already accept a ready clone's label and refuse paths; the bug is only the selector the caller passes.
- Local task resolution, executor option shapes, remote-workspace lifecycle and clone creation. They are unaffected and keep their existing tests.
- The other three backlog entries on this PR branch.
