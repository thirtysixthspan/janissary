# Carry each remote harness's recorded MCP and offline launch through a session attach

**Complexity: 6/10** — 15 requirements, 9 production files, 12 test scenarios, ~25 added lines (p=6.18)

## Goal

A remote harness tab rebuilt by Attach should show the MCP flag the far harness was actually launched with. Today `startSessionAttach` passes no `mcp` and `offline: false`, the session record never stores the MCP decision, and `HarnessTabSpawn.spawnTab` recomputes the flag from whether the local MCP server is running at attach time. So a far harness launched with `--no-mcp` or `--offline` shows an MCP flag after an attach while the local server runs, and one launched with MCP loses the flag when the local server is down. This change records the far process's MCP decision alongside its offline mode and replays both on attach, so the metadata row reports the launch rather than the current local state.

## Requirements

1. The process state built from a harness `spawn` frame carries the frame's `mcp` flag, the way it carries `autoApprove` ("copy it in `spawnFrameState` in `src/remote/process-state.ts` the way `autoApprove` is copied").
2. A `session-state-result` process carrying a boolean `mcp` decodes with that field kept ("Check the session-state decoder accepts the new optional field").
3. A `session-state-result` process whose `mcp` is not a boolean is refused as a malformed frame.
4. The session record written for a harness process stores the process's `mcp` flag.
5. The session record written for a harness process stores the process's `offline` mode ("read it (and the recorded `offline`) from the matching process").
6. A stored session record whose harness process carries a boolean `mcp` loads back unchanged.
7. A stored session record whose process `mcp` is not a boolean is dropped on load.
8. Attaching a harness session passes the recorded `mcp` flag of the launch process to the harness attach.
9. Attaching a harness session passes the recorded `offline` mode of the launch process to the harness attach.
10. A recorded harness process with no `mcp` field attaches with MCP off, since it describes a launch that carried no MCP decision.
11. A recorded harness process with no `offline` field attaches online, as it does today.
12. An attach that adopts a recorded process (`resumePtyId` set) takes `tab.mcp` from the recorded flag rather than from `localLaunch()` ("for an attach (`options.resumePtyId` set) take `tab.mcp` from the recorded flag").
13. An attach of a process recorded with `mcp: false` yields `tab.mcp === false` while the local server runs ("an attach of a process recorded with `mcp: false` yields `tab.mcp === false` while the local server runs").
14. An attach of a process recorded with `mcp: true` yields `tab.mcp === true`, including while the local server is down ("one recorded with `mcp: true` yields `true`").
15. A detach after an attach records the same `mcp` flag again, so repeated cycles keep the original launch's decision.

## Design decisions

- The MCP decision travels the same path `autoApprove` and `autoResume` already travel: spawn frame, `RemoteProcessState`, the local session record, and back into `SpawnTabOptions` on attach. No new frame or protocol version is needed, because the field is optional and version 49 is this feature set's own unreleased version (Assumption 4).
- `snapshot.ts`'s `processOf` copies `mcp` and `offline` for a harness process exactly as it copies `autoApprove`, leaving the field out when the state left it out.
- `startSessionAttach` reads the launch process once and passes `offline: process?.offline ?? false`, and passes `mcp: process?.mcp ?? false` beside `resumePtyId`, so the recorded flag travels only with an adopted spawn id. A missing `mcp` means a launch with no MCP decision, which is off (Assumption 2).
- `HarnessTabSpawn.spawnTab` uses `options.mcp === true` as the decision whenever `options.resumePtyId` is set, and keeps today's `options.mcp !== false && !offline && launch !== undefined` otherwise. Keying on `resumePtyId` rather than `resume` keeps an attach that names no recorded spawn id, which spawns a fresh process, on the fresh-launch rule (Assumption 3).
- The attach's MCP decision also feeds the replayed `spawn` frame, which the channel records again, so the next detach writes the same flag back (Assumption 5).
- `SpawnTabOptions.mcp`'s comment changes from "absent on an attach" to describing the recorded flag on an attach.

## Preserved behavior

1. A fresh local launch with the server up injects the MCP variables and fragment and marks `tab.mcp` true; it must not lose the flag or variables because of the attach branch. Pinned by "injects the three variables and the command fragment on a local launch" in `src/harness/tab-spawn.test.ts`.
2. A fresh local launch while the server is down gets no MCP variables or fragment; it must not pick up MCP from any recorded state. Pinned by "passes no MCP variables or fragment while the local server is down" in `src/harness/tab-spawn.test.ts`.
3. A fresh remote launch forwards `mcp: false` while the local server is down; it must not forward `true`. Pinned by "forwards mcp false for a remote launch while the local server is down" in `src/harness/tab-spawn.test.ts`.
4. A recorded harness's auto-approve and auto-resume settings still reach the attach; they must not be dropped by the reworked process lookup. Pinned by "restores a recorded harness auto-approve setting" in `src/sessions/attach.test.ts`.
5. Repeated detach and attach cycles restore the same far process without spawning a replacement; the cycle must not spawn a second harness. Pinned by "restores the same harness through two cycles without closing the tab or losing its row" in `src/sessions/harness-roundtrip.test.ts`.
6. A malformed `session-state-result` entry still refuses the whole answer; it must not be silently shortened. Pinned by "refuses the whole answer when one entry among several is malformed" in `src/remote/protocol.test.ts`.

## Assumptions

1. `spawnTab` decides MCP from the local server at `src/harness/tab-spawn.ts:50`: "`enabled: options.mcp !== false && !offline && launch !== undefined`".
2. MCP arrives with this pull request, so any record written by a released Janissary predates MCP and its harness had no MCP config: `src/remote/protocol.ts:273` "Version 49 adds the `mcp-call` and `mcp-result` frames".
3. An attach adopts the recorded process only when a spawn id is recorded: `src/sessions/attach.ts:131` "`...(spawnId !== undefined && { resumePtyId: spawnId })`".
4. The far side answers `session-state` from the same `spawnFrameState` the local side records: `src/remote/serve-processes.ts:104` "`map(({ frame }) => spawnFrameState(frame))`".
5. Every `spawn` frame the channel sends is recorded for the next session record: `src/remote/channel/index.ts:90` "`if (frame.type === 'spawn') { this.router.record(frame);`".
6. The harness spawn frame always carries a boolean `mcp`: `src/harness/tab-spawn.ts:109` "`mcp: mcp.enabled`".

## Existing functionality

1. `spawnFrameState` copies optional spawn fields into process state: `src/remote/process-state.ts:15` "`...(frame.autoApprove !== undefined && { autoApprove: frame.autoApprove })`".
2. `decodeProcessState` validates optional booleans in a session-state answer: `src/remote/frame/decode-sessions.ts:19` "`!(autoApprove === undefined || typeof autoApprove === 'boolean')`".
3. `processOf` turns a harness state into a record process: `src/sessions/snapshot.ts:77` "`function processOf(`".
4. `isProcess` guards a stored record process: `src/sessions/store.ts:89` "`(value.autoApprove === undefined || typeof value.autoApprove === 'boolean')`".
5. `startSessionAttach` reads recorded per-process settings for the attach: `src/sessions/attach.ts:128` "`autoApprove: record.processes.find((process) => process.id === spawnId)?.autoApprove ?? false`".
6. The tab-spawn test fakes the local server and a remote channel: `src/harness/tab-spawn.test.ts:98` "`function withMcp(`" and `:109` "`function remoteManagers(`".

## Implementation steps

1. Add `mcp?: boolean` to `RemoteProcessState` in `src/remote/protocol-frames.ts`, copy it in `spawnFrameState` in `src/remote/process-state.ts`, and accept and copy it in `decodeProcessState` in `src/remote/frame/decode-sessions.ts`. Add one sentence to the version-49 note in `src/remote/protocol.ts` saying a session-state process reports the launch's `mcp` flag. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Add `mcp?: boolean` to `RemoteSessionProcess` in `src/sessions/store.ts` and validate it in `isProcess`. In `processOf` in `src/sessions/snapshot.ts`, copy `mcp` and `offline` onto a harness process when present, and widen its `state` parameter type to include `mcp`. Build command: `$janissary/scripts/run.mjs check-diff`.
3. In `src/sessions/attach.ts`, look up the launch process once and pass its `autoApprove`, `autoResume`, and `offline` to `attachRemote`, defaulting each to `false`, and pass its `mcp` (default `false`) beside `resumePtyId`. Build command: `$janissary/scripts/run.mjs check-diff`.
4. In `HarnessTabSpawn.spawnTab` in `src/harness/tab-spawn.ts`, take the decision from `options.mcp === true` when `options.resumePtyId` is set, and update the `mcp` comment in `src/harness/spawn-options.ts`. Build command: `$janissary/scripts/run.mjs check-diff`.
5. Update `product/specs/tabs.md`'s MCP flag paragraph, `product/specs/sessions-tab.md`'s attach paragraph, and the session-state reply paragraph of `product/specs/remote-server.md`. Build command: `$janissary/scripts/run.mjs check-diff`.

## User interface

1. The harness tab metadata row's MCP flag after an Attach shows exactly when the far harness was launched with MCP config, independent of whether the local MCP server is running at attach time. It starts in its plain look; no new control, state, or style is added.
2. The offline flag on an attached harness tab reflects the far harness's recorded offline launch.

## Tests

- `src/remote/process-state.test.ts`: a harness spawn frame with `mcp: true` reports `mcp: true` in its state (Requirement 1).
- `src/remote/protocol.test.ts`: the harness-and-shell round-trip case carries `mcp: false` on the harness, the fully populated `session-state-result` fixture carries `mcp`, and a process with a string `mcp` is refused by name (Requirements 2 and 3).
- `src/sessions/snapshot.test.ts`: a harness state with `mcp` and `offline` records both (Requirements 4 and 5).
- `src/sessions/store.test.ts`: a harness process with `mcp: true` and `offline: true` round-trips, and one with a non-boolean `mcp` is refused (Requirements 6 and 7).
- `src/sessions/attach.test.ts`: a recorded `mcp: true, offline: true` reaches `attachRemote`, and a record without either reaches it with both `false` (Requirements 8 to 11).
- `src/harness/tab-spawn.test.ts`: an attach with `resumePtyId` and `mcp: false` yields `tab.mcp === false` with the server up, and one with `mcp: true` yields `tab.mcp === true` with the server down (Requirements 12 to 14).
- `src/sessions/harness-roundtrip.test.ts`: a harness launched while the local server is down, then detached and attached after the server comes up, keeps `tab.mcp === false` and its record keeps `mcp: false` (Requirement 15).

## Out of scope

- The "in use" green look of the MCP flag still resets to plain across an attach, because the far side does not report prior use.
- The local MCP server's lifecycle, the far-side endpoint, and fresh launch decisions are unchanged.
- No protocol version bump and no migration of stored records.
- The other entries in `product/backlog/pull-request.md`.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck, and the server tests pass.

Then, in the running app with a reachable remote host and the local MCP server running, launch `harness claude on <host> --no-mcp`, confirm the metadata row shows no MCP icon, detach it from the Sessions tab, and attach it again. The rebuilt tab must still show no MCP icon; an MCP icon after the attach is the failure. Repeat with a plain `harness claude on <host>` launch, then restart Janissary while holding the saved MCP port with another process so the local server is down, and attach the session: the rebuilt tab must show the plain MCP icon, and a missing icon is the failure.
