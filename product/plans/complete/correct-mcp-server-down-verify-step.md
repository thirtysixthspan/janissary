# docs(mcp): make the PR description's server-down launch step performable and anchor it to the local test

**Complexity: 1/10** — no production lines or files, 7 requirements, no test scenarios (p=3.04)

## Goal

PR #2256's How to verify step 9 asks the tester to "stop the local MCP server before a third launch". Nothing in the app does that. The `mcp` command only reports status, and the server is down only when it failed to start. The step also cites "forwards mcp false for a remote launch while the local server is down", a remote-launch test, for what is a local launch. A tester can't follow the step as written and may report the server-down path as unverified. This plan rewrites step 9 so the third launch happens on an instance whose server couldn't bind its persisted port, the same setup step 10 uses, and cites the local server-down test beside the remote one.

## Requirements

1. Step 9 no longer asks the tester to "stop the local MCP server", per the backlog issue "nothing in the app stops a running server".
2. Step 9 sets up the third launch "by holding the persisted MCP port with another process before starting the app (as step 10 does)", per the backlog proposal.
3. Step 9 tells the tester to confirm `mcp` prints `status: not running` before the third launch, so the server-down state is observable rather than assumed.
4. Step 9 cites the test "passes no MCP variables or fragment while the local server is down" in `src/harness/tab-spawn.test.ts`, per the backlog proposal.
5. Step 9 keeps the test "forwards mcp false for a remote launch while the local server is down" beside the local one, per the proposal's "beside the existing remote test".
6. Step 9 keeps its existing `--offline` and `--no-mcp` launches and their two test anchors.
7. The correction leaves the change-set statistics out, with no commit, file, or line counts and no SHAs.

## Design decisions

- Only How to verify step 9 changes. The work item names that step, and the playbook forbids touching unrelated description text.
- The server-down setup is a bind collision on the persisted port at startup, because that is the only runtime path that leaves the server down while Janissary runs (Assumptions 1 and 2).
- The step names `.janissary/mcp.json` as where the persisted port lives, so the tester knows which port to hold (Assumption 3).
- The remote test stays cited but is labeled as covering the same server-down decision for a remote launch, so a reader doesn't take it as the local proof.
- The setup paragraph and step 10 stay as written. Holding the port in step 9 overlaps step 10's setup, but step 10 belongs to the author and isn't named by this work item.
- `product/specs/mcp-server.md` and `product/specs/harness.md` already say a launch while the server is not running gets no MCP config (Assumption 4), so neither spec changes.
- The body edit happens after the push, through `gh pr edit --body-file ./temp/pr-body.md`, with the body re-read just before the edit.

## Preserved behavior

None found

## Assumptions

1. `McpManager` exposes no stop besides `dispose`, which runs at shutdown: `src/mcp/manager.ts:127` "`dispose(): void {`", and `src/commands/mcp.ts:21` "`run: (command_, tab, managers, invocation) => {`" only renders `managers.mcp.status()`.
2. A failed start records the reason and leaves `launch` unset: `src/mcp/manager.ts:179` "`this.failure = reasonOf(error);`".
3. The persisted port is the `port` field of the state file `.janissary/mcp.json`: `src/mcp/manager.ts:27` "`type State = { port?: number; token: string };`" and `src/mcp/manager.ts:112` "`path.join(projectDir, '.janissary', 'mcp.json')`".
4. The specs already cover a launch while the server is down: `product/specs/mcp-server.md:53` "a launch while the server is not running ... receive neither the server fragment nor any of the three variables".
5. A local launch's MCP decision requires a local launch value: `src/harness/tab-spawn.ts:53` "`options.mcp !== false && !offline && launch !== undefined`".

## Existing functionality

1. The local server-down test: `src/harness/tab-spawn.test.ts:184` "`passes no MCP variables or fragment while the local server is down`".
2. The remote server-down test: `src/harness/tab-spawn.test.ts:205` "`forwards mcp false for a remote launch while the local server is down`".
3. The `--no-mcp` test: `src/harness/tab-spawn.test.ts:165` "`passes no MCP variables or fragment with --no-mcp`".
4. The `--offline` test: `src/harness/tab-spawn.test.ts:175` "`passes no MCP variables or fragment with --offline`".

## Implementation steps

1. Promote this plan to `product/plans/complete/` and remove the matching entry from `product/backlog/pull-request.md`, leaving the other entries byte-for-byte. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Commit with `$janissary/scripts/run.mjs pr-commit` and push to `feat/janissary-mcp-server`.
3. Re-read the PR body with `gh pr view --json body`. Replace step 9's Do and Expect lines so the first two launches stay, the third follows a restart with the `.janissary/mcp.json` port held by another process and a `status: not running` check, and the Expect cites the local server-down test plus the remote one labeled as the remote case. Write the full body to `./temp/pr-body.md` and apply it with `gh pr edit --body-file`.

## UI design

None. The change touches only the pull request description.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. The tests named in Requirements 4 to 6 already pin the behavior the corrected step describes.

## Out of scope

- Any code change, including adding a way to stop the MCP server.
- The How to verify setup paragraph and step 10.
- The wrong-anchors backlog entry and the harness help entry.
- The PR title.
- `product/specs/mcp-server.md` and `product/specs/harness.md`, which already match.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Then read the PR body with `gh pr view 2256 --json body`. Step 9 should keep the `--offline` and `--no-mcp` launches, set up the third launch by holding the `.janissary/mcp.json` port with another process before restarting the app, and check `mcp` shows `status: not running` first. Its Expect line should cite "passes no MCP variables or fragment while the local server is down" and, labeled as the remote case, "forwards mcp false for a remote launch while the local server is down". Both names should match `it(` lines in `src/harness/tab-spawn.test.ts`. A diff of the old and new body should show only step 9 changed. The phrase "stop the local MCP server" surviving, or any other line differing, means the correction was wrong.
