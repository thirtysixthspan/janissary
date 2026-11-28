# docs(mcp): describe the behaviors the later repairs added to the MCP server pull request

**Complexity: 1/10** — no production lines or files, 12 requirements, no test scenarios (p=3.39)

## Goal

PR #2256's description was written before the review repairs landed, and it says nothing about six behaviors the branch now ships. Attach now rebuilds a remote harness tab with the offline mode and MCP decision recorded at launch. The far side holds frames for an MCP spawn that is still waiting on its endpoint's bind. The local side checks relayed calls a second time. Saved and overridden MCP ports are reserved against the browser guard's draws. A broken `.janissary/mcp.json` gets a reason naming the file and its remedy. And a notification raised before the first tab opens is recorded with no focus suppression. A reviewer approving from the description never weighs any of these, so a regression in one of them could reach master unexamined. This plan adds short anchored claims for each to the description's What section and changes nothing else.

## Requirements

1. The What section states that Attach "passes the recorded `offline` and `mcp` of the launch process" to the rebuilt remote harness tab, per the proposal.
2. The What section states that the attached tab "takes the decision from `options.mcp` when `resumePtyId` is set" rather than from the local server's current state, per the proposal.
3. The What section states that "frames that reach the far side while an MCP spawn waits on its bind are held or cancel the spawn", per the work item.
4. The What section states that the local side "refuses relayed calls naming an unknown tool" with `Unknown MCP tool "<tool>".`, per the work item.
5. The What section states that the local side refuses relayed calls "carrying non-string options" with `options must be a list of strings.`, per the work item.
6. The What section states that "saved and overridden MCP ports are reserved against browser guards", per the work item.
7. The What section states that "an `mcpPort` override is never saved", per the work item.
8. The What section states that "a broken `.janissary/mcp.json` gives a reason naming the file and its remedy", per the work item.
9. The What section states that "a notification raised before the first tab opens is no longer focus-suppressed", per the work item.
10. Each new claim carries "a line anchor taken at the branch head at edit time and a test anchor", per the proposal.
11. No existing sentence of the description changes, per the proposal's "without changing any existing sentence".
12. The new text adds "no commit, file, or line counts and no SHAs", per the proposal.

## Design decisions

- The six claims go into one new paragraph at the end of the What section, after the remote protocol paragraph. Appending keeps every existing paragraph byte-for-byte and keeps the new material where the What section already describes behavior.
- Line anchors are taken from the current head of `feat/janissary-mcp-server`, re-read just before the edit (Assumptions 1 to 9).
- Each claim names the observable behavior first and carries its anchors in the description's existing `[path:line]` and `[test: file "name"]` bracket style.
- The no-tab claim says what the repair actually changed: `notify` treats an empty tab list as having no active tab, so the notification is recorded and nothing is suppressed for focus (Assumption 9). It does not name `mcp-failed` as the focus-suppressed case, because that event is explicit and was never subject to focus suppression (Assumption 10).
- No code, spec, help, or test changes. The work item is a description correction only.
- The body edit happens after the push, through `gh pr edit --body-file ./temp/pr-body.md`, with the body re-read just before the edit.

## Preserved behavior

None found

## Assumptions

1. Attach passes the recorded launch settings: `src/sessions/attach.ts:129` "`offline: recorded?.offline ?? false,`" and `src/sessions/attach.ts:135` "`...(spawnId !== undefined && { resumePtyId: spawnId, mcp: recorded?.mcp ?? false }),`".
2. An attach takes the MCP decision from its options: `src/harness/tab-spawn.ts:52-54` "`const enabled = options.resumePtyId === undefined`" and "`: options.mcp === true;`".
3. Frames for a waiting spawn are held by `PendingSpawns`: `src/remote/serve-pending-spawns.ts:9` "`export class PendingSpawns {`", and routed there first by `input`, `resize` and `kill` at `src/remote/serve-processes.ts:107-121` "`if (this.pending.input(id, data)) return;`".
4. A cancelled wait starts no harness and held frames replay once it starts: `src/remote/serve-processes.ts:94-98` "`if (held === undefined || this.mcp !== endpoint) throw new Error(`Spawn ${frame.id} was cancelled before it started.`);`".
5. A second spawn with a pending id is refused: `src/remote/serve-processes.ts:63` "`if (this.entries.has(frame.id) || this.pending.has(frame.id)) return;`".
6. Relayed calls are checked for the tool and then the arguments: `src/remote/mcp-relay.ts:21-22` "`return { error: unknownToolError(frame.tool) };`" and "`return validateQuestionArgs(args as Record<string, unknown>);`", with the text at `src/mcp/tools.ts:24` "`Unknown MCP tool \"${tool}\".`".
7. A known port is reserved and a first start under an override saves only the token: `src/browser/e2e-ports.ts:115` "`export function reservePort(port: number): ReservedPort {`", `src/mcp/manager.ts:150-152` "`: reservePort(configured);`", and `src/mcp/manager.ts:71` "`if (override !== undefined) return state ? undefined : { token };`".
8. A broken state file names the file and the remedy: `src/mcp/manager.ts:57` "`unreadable MCP state file ${file}`", `src/mcp/manager.ts:60` "`invalid MCP state file ${file}; ${STATE_REMEDY}`", and `src/mcp/manager.ts:19` "`'delete it and restart Janissary to replace it'`".
9. With no tabs open there is no active label and focus suppresses nothing: `src/notifications/index.ts:210` "`managers.tab.tabs.length === 0 ? undefined : managers.tab.cur().label`".
10. `mcp-failed` is an explicit event: `src/notifications/index.ts:142` "`'mcp-failed': true,`" in `EXPLICIT_EVENTS`.

## Existing functionality

1. Attach test: `src/sessions/attach.test.ts` "passes the recorded harness MCP decision and offline mode to the harness attach".
2. Attach round-trip test: `src/sessions/harness-roundtrip.test.ts` "keeps a harness launched without MCP flagged off through an attach once the local server runs".
3. Spawn-wait tests: the four cases under "an MCP spawn waiting on its endpoint bind" in `src/remote/serve-mcp.test.ts`.
4. Relayed-validation test: `src/remote/mcp-relay.test.ts` "refuses $label without registering and lets a later valid call with the same id register".
5. Port tests: `src/mcp/manager-port.test.ts` "reserves a reused saved port so a guard draw landing on it is handed another" and `src/mcp/manager.test.ts` "saves only the token when a first start binds mcpPort, and draws a reachable port once it is removed".
6. State-file tests: `src/mcp/manager.test.ts` "names the state file and the remedy when it is not valid JSON" and "names the state file and the remedy when it cannot be read".
7. No-tab tests: `src/notifications/index.test.ts` "is not suppressed for focus when no tab is active yet" and "records a notification while no tab is open yet".

## Implementation steps

1. Promote this plan to `product/plans/complete/` and remove the matching entry from `product/backlog/pull-request.md`, leaving every other entry byte-for-byte. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Commit with `$janissary/scripts/run.mjs pr-commit` and push to `feat/janissary-mcp-server`.
3. Re-read the PR body with `gh pr view --json body` and re-check each anchor in Assumptions 1 to 9 at the head. Append one paragraph to the end of the What section, before `### Behavior examples`, holding the six claims with their line and test anchors. Write the full body to `./temp/pr-body.md` and apply it with `gh pr edit --body-file`.

## UI design

None. The change touches only the pull request description.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. The tests named in Existing functionality already pin each new claim.

## Out of scope

- Any code, spec, help, or test change.
- Every existing sentence and anchor in the description, including anchors that later commits may have moved.
- The PR title.
- The other entries in `product/backlog/pull-request.md`.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then diff the old and new PR bodies. The only difference should be one added paragraph at the end of the What section. Any changed character in an existing paragraph means the correction was wrong. Open each new line anchor at the branch head: `src/sessions/attach.ts:127-136` should show the `attachRemote` call with the recorded `offline` and `mcp`, `src/remote/serve-pending-spawns.ts:9-45` should show `PendingSpawns`, `src/remote/mcp-relay.ts:21-22` should show the unknown-tool check, `src/mcp/manager.ts:68-73` should show `stateToSave`, `src/mcp/manager.ts:50-61` should show `loadState`, and `src/notifications/index.ts:208-211` should show the empty-tab-list check. An anchor that opens on unrelated code means it was taken from a stale head.
