# docs(mcp): point the PR description's code anchors at the lines that hold each claim

**Complexity: 1/10** — no production lines or files, 11 requirements, no test scenarios (p=3.33)

## Goal

PR #2256's description backs its claims with `path:line` anchors, and many of them no longer land on the code they cite. Some were wrong when written, and the fixes pushed since the review moved the rest. `src/mcp/manager.ts:159-162` should show the failure notice but now falls past the end of `start`. `src/remote/serve-mcp.ts:167-170` should show the detached refusal but lands inside the `mcp-call` frame literal. A reviewer who follows such an anchor lands on unrelated code and may decide the claim is unsupported. This plan re-derives every anchor in the body from the current head and rewrites only the ones that miss, leaving every other word as the author wrote it.

## Requirements

1. The failure-notice anchors point at `recordFailure` and the final catch of `start` in `src/mcp/manager.ts`, per the proposal's "`recordFailure` and the final catch of `start` in `src/mcp/manager.ts` for the failure notice".
2. The `mcpPort` override anchors point at "the `getConfig().mcpPort ?? state?.port` line of `start`", per the proposal.
3. The detached-refusal anchor points into `relay` in `src/remote/serve-mcp.ts`, per the proposal's "`relay` in `src/remote/serve-mcp.ts` for the detached refusal".
4. The `mcp-call` send anchor points into `relay`, per the proposal's "and the `mcp-call` send".
5. The stored-reason replay anchor points at `launch`, per the proposal's "`launch` for the stored-reason replay".
6. The protocol-version anchor points at "the `REMOTE_PROTOCOL_VERSION = 49` line in `src/remote/protocol.ts`", per the proposal.
7. The relay-clearing anchor points at "the `onFinalClose` line in `src/remote/entry-factory.ts`", per the proposal.
8. Every other `path:line` anchor in the body that misses its claim at the current head is re-pointed at the lines that hold it, per the work item's goal that anchors "land on the code they describe".
9. Test anchors that already pin a claim stay beside the line anchors, per the proposal's "keep the test anchor beside the line".
10. No text other than anchors changes, except the anchor's own brackets, per the playbook's rule to preserve unrelated description text exactly.
11. The correction adds no commit, file, or line counts and no SHAs.

## Design decisions

- Line numbers come from the current head of `feat/janissary-mcp-server`, not from the backlog entry. The entry's own "correct" locations were written before later fixes moved the code (Assumptions 1 to 4).
- An anchor that already lands on its claim stays as written, even when a tighter range exists. That keeps the diff to the anchors that are actually wrong.
- Where the cited behavior lives in a different file from the one the anchor names, the anchor moves to that file. The "one endpoint per `remote-serve` process" claim is held by `RemoteProcesses.spawn`, not by `FarSideMcp` (Assumption 5).
- Where one claim joins two mechanisms held in separate places, the anchor is split into two adjacent anchors rather than one wide range. Examples are the exit-code-1 refusal in `serve.ts` beside the bind wait in `serve-mcp.ts`, and the malformed-argument decode beside the early answer in `mcp-relay.ts`.
- No anchor's target has disappeared from the code, so no surrounding words change.
- No spec, help page, or code changes. The work item is a description correction only.
- The body edit happens after the push, through `gh pr edit --body-file ./temp/pr-body.md`, with the body re-read just before the edit.

## Preserved behavior

None found

## Assumptions

1. The failure notice is `recordFailure` and the final catch of `start`: `src/mcp/manager.ts:140` "`notify(managers, 'mcp-failed', SYSTEM_LABEL, `MCP server failed to start: ${this.failure}`)`" and `src/mcp/manager.ts:179` "`this.failure = reasonOf(error);`".
2. The override is read in `start`: `src/mcp/manager.ts:148` "`const override = getConfig().mcpPort;`" and `src/mcp/manager.ts:149` "`const configured = override ?? state?.port;`".
3. The detached refusal and the `mcp-call` send are in `relay`: `src/remote/serve-mcp.ts:163` "`if (this.detached && !this.linked()) { reject(new Error(NOT_CONNECTED)); return; }`" and `src/remote/serve-mcp.ts:174` "`const delivered = this.send(frame);`".
4. The stored reason is replayed by `launch`: `src/remote/serve-mcp.ts:86` "`this.send({ type: 'output', id, data: `${this.failure}\n` });`".
5. One endpoint per process is kept by `RemoteProcesses.spawn`: `src/remote/serve-processes.ts:76` "`const endpoint = this.mcp ??= new FarSideMcp(`".
6. The version line and the final-close hook: `src/remote/protocol.ts:281` "`export const REMOTE_PROTOCOL_VERSION = 49;`" and `src/remote/entry-factory.ts:160` "`onFinalClose: () => mcpRelay.clear(),`".
7. A failed spawn answers exit code 1: `src/remote/serve.ts:221` "`this.emit({ type: 'exit', id: frame.id, exitCode: 1 });`".

## Existing functionality

1. The failure-notification test: `src/mcp/manager.test.ts` "records one failure notification and stays down when the port is taken".
2. The detached-refusal test: `src/remote/serve-mcp.test.ts` "fails a call made while detached at once with the detach error".
3. The stored-reason test: `src/remote/serve.test.ts` "reports a failed shared MCP endpoint to a later harness before exiting it".

## Implementation steps

1. Promote this plan to `product/plans/complete/` and remove the matching entry from `product/backlog/pull-request.md`, leaving the harness help entry byte-for-byte. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Commit with `$janissary/scripts/run.mjs pr-commit` and push to `feat/janissary-mcp-server`.
3. Re-read the PR body with `gh pr view --json body`. Replace each anchor that misses its claim with the current lines:
   - `src/mcp/tools.ts:24-30` becomes `26-32` (`TOOLS`).
   - `src/mcp/manager.ts:62-72` becomes `75-97` (`listen`), and `65-72` becomes `78-89` (the `/mcp`-only handler and the loopback bind).
   - `src/mcp/manager.ts:57-59` becomes `63-66` (`saveState`), `98-99` becomes `148-149` in both places, `141` becomes `140`, `159-162` becomes `178-181`, `97-100` becomes `111-114`, `102-107` becomes `116-121`, and `123-133` becomes `139-141` plus `178-181`.
   - `src/mcp/question-tool.ts:3-30` becomes `3-43` in all three places.
   - `src/harness/tab-spawn.ts:49-51` becomes `49-55`.
   - `src/remote/protocol.ts:277` becomes `281`, and `src/remote/entry-factory.ts:159` becomes `160`.
   - `src/remote/mcp-relay.ts:19-43` becomes `34-56` in both places, and `25-31` becomes `12-20` plus `40-44`.
   - In `src/remote/serve-mcp.ts`: `57-89` becomes `56-90`; `14-17` becomes `37-45`; `57-105` becomes `src/remote/serve-processes.ts:76-79`; `85-105` becomes `71-89` plus `src/remote/serve.ts:218-222`; `132-144` becomes `131-159` plus `177`; `162-187` becomes `133-137` plus `163`; `184-188` becomes `169-173`; `123-130` becomes `108-115`; `146-152` becomes `133-137` plus `src/remote/mcp-relay.ts:57-59`; `167-181` becomes `164-174`; `20` becomes `17`; `91-97` becomes `82-88`; and `167-170` becomes `163`.
   Write the full body to `./temp/pr-body.md` and apply it with `gh pr edit --body-file`.

## UI design

None. The change touches only the pull request description.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. The tests named in Existing functionality already pin the claims whose anchors move.

## Out of scope

- Any code, spec, or help change.
- Anchors that already land on their claim, including `src/mcp/manager.ts:15-17`, `src/mcp/guard.ts:12-30`, `src/remote/base64-fields.ts:66`, `src/remote/serve-detach.ts:76`, `src/remote/serve.ts:227-231`, and every `web/src/` anchor.
- Test-name anchors, which name tests rather than lines.
- The harness help backlog entry and the PR title.
- The "Tested at" line in Additional test cases, which belongs to the testing record.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read the PR body with `gh pr view 2256 --json body` and open each anchor named in Implementation step 3 at the branch head. `src/mcp/manager.ts:178-181` should show the catch that calls `recordFailure`. `src/remote/serve-mcp.ts:163` should show the `NOT_CONNECTED` rejection. `src/remote/serve-mcp.ts:82-88` should show `launch` sending the stored failure as `output`. `src/remote/protocol.ts:281` should show `REMOTE_PROTOCOL_VERSION = 49`. A diff of the old and new body should differ only inside `[path:line]` brackets. Any changed word outside an anchor, or an anchor that opens on unrelated code, means the correction was wrong.
