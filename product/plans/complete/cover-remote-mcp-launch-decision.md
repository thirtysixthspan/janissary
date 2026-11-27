# test: cover the remote-launch MCP decision when the local server is down

**Complexity: 2/10** — no production lines or files (tests only), 5 requirements and 5 scenarios (p=3.50)

## Goal

The remote-launch MCP decision in `HarnessTabSpawn.spawnTab` sets `mcp.enabled` to false when the local server is down or `--offline` is set, and forwards that boolean into the third argument of `registerRemotePty` on the spawn frame. The existing remote test in `src/harness/tab-spawn.test.ts` only checks the command fragment and that no local environment is built; it never reads the forwarded `mcp` flag, so a regression that sends `mcp: true` with no local listener would pass. Meanwhile the two tests in `src/remote/manager.test.ts` call `createRemotePtySession` with a literal flag and are titled as if they proved the launch decision and the server-down rule, which they do not. The goal is to pin the real server-down, offline, and enabled decisions at the remote-launch seam and retitle the two lower-level pass-through checks honestly, without changing production code.

## Requirements

1. "asserts the third argument of `registerRemotePty` carries `mcp: false` when `localLaunch()` returns undefined" — a remote launch with no local MCP server sends `mcp: false` in the spawn options.
2. "and when `--offline` is set" — a remote launch with `--offline` sends `mcp: false` in the spawn options even when a local MCP launch exists.
3. "a second case with `withMcp(managers, MCP)` asserting `mcp: true` is forwarded" — a remote launch with a local MCP launch available sends `mcp: true` in the spawn options.
4. The first direct pass-through test in `src/remote/manager.test.ts` is retitled so it "no longer claim[s] to test the launch decision" — its title names only the spawn-frame pass-through of a false flag.
5. The second direct pass-through test in `src/remote/manager.test.ts` is retitled so it "no longer claim[s] to test … the server-down rule" — its title names only the spawn-frame pass-through of a true flag.

## Design decisions

- Add the three decision cases to the existing `describe('HarnessTabSpawn MCP environment')` block in `src/harness/tab-spawn.test.ts`, beside the local-launch cases that already pin the same three conditions, rather than creating a new test module.
- Reuse the existing `withMcp(managers, launch)` and `remoteManagers(managers)` fixtures in that file, and the same `run('harness claude on devbox …')` / `ready()` / `advanceTimersByTimeAsync(0)` sequence the current remote case uses, as the Proposal directs: "reuse that fixture shape rather than inventing a new one."
- Read the flag from `(registerRemotePty as …).mock.calls[0][2].mcp`, the third argument named by the Proposal, rather than from the tab or the spawn environment — the decision is forwarded at that argument.
- Keep the two `createRemotePtySession` cases in `src/remote/manager.test.ts` as "the lower-level pass-through check": retitle only, leaving both test bodies byte-for-byte unchanged.
- Change no production code and no spec, help, or documentation file: the decision already behaves as specified, so the work is verification only.

## Preserved behavior

1. A local launch with no local MCP server still injects no MCP variables or command fragment, and that case still passes. Pinned by `passes no MCP variables or fragment while the local server is down` in `src/harness/tab-spawn.test.ts`; the new remote cases must not change that fixture or assertion.
2. A remote launch still builds no local MCP spawn environment, and the command fragment is still composed with the MCP config argument. Pinned by `builds no local MCP variables for a remote launch` in `src/harness/tab-spawn.test.ts`; the new cases must not add local spawn-env calls or weaken that assertion.
3. The direct `createRemotePtySession` cases still assert the spawn frame carries exactly the flag handed to them, and retitling them must not change what they check. Pinned by `sends mcp true only when the launch decided the far side starts an endpoint` in `src/remote/manager.test.ts` (before retitle).

## Assumptions

1. The decision is `src/harness/tab-spawn.ts:49-50` `const launch = this.managers.mcp?.localLaunch();` followed by `const mcp: McpDecision = { enabled: options.mcp !== false && !offline && launch !== undefined, launch };`, so a missing launch, `--offline`, and `--no-mcp` all yield `enabled: false`.
2. The flag reaches the spawn frame at `src/harness/tab-spawn.ts:108-110` `this.managers.pty.registerRemotePty(label, channel, { … mcp: mcp.enabled, }, options.resumePtyId)`, so the third argument's `mcp` property is the value to assert.
3. `src/harness/tab-spawn.test.ts:98-103` defines `withMcp(managers, launch)` and `src/harness/tab-spawn.test.ts:109-123` defines `remoteManagers(managers)` returning `registerRemotePty` and `ready`; they are the fixtures the Proposal names.
4. `src/harness/tab-spawn.test.ts:179-189` `builds no local MCP variables for a remote launch` is the existing remote-launch sequence (`run`, `ready('/srv/ws')`, `advanceTimersByTimeAsync(0)`) the new cases extend.
5. `src/remote/manager.test.ts:1052-1076` `describe('remote spawn MCP flag')` holds the two pass-through tests and their misleading titles; `src/remote/pty-session.ts:124` shows `createRemotePtySession` only forwards `mcp` into the `spawn` frame, so those tests cannot exercise the launch decision.
6. `src/harness/command-parse.ts:120` `const offline = tokens.some((t) => t.toLowerCase() === '--offline');` parses `--offline` independently of the remote address, so a remote command carrying `--offline` reaches `spawnTab` with `offline: true`.

## Existing functionality

1. `withMcp` in `src/harness/tab-spawn.test.ts:98` installs the `mcp.localLaunch()` stub the spawn decision reads.
2. `remoteManagers` in `src/harness/tab-spawn.test.ts:109` installs the `registerRemotePty` spy and the remote `create`/`get` fixtures, exposing the third argument the new assertions read.
3. `HarnessTabSpawn.spawnTab` in `src/harness/tab-spawn.ts:36` already computes `mcp.enabled` from the launch, offline, and `--no-mcp` inputs; the tests only observe it.
4. `createRemotePtySession` in `src/remote/pty-session.ts:56` already forwards the `mcp` option into the spawn frame, which is what the two retitled tests assert.

## Implementation steps

1. In `src/harness/tab-spawn.test.ts`, inside `describe('HarnessTabSpawn MCP environment')`, add three cases after the existing remote case, each using `makeManagers()`, `withMcp(...)`, `remoteManagers(...)`, `new HarnessManager(managers).run('harness claude on devbox --no-browser' …)`, `ready('/srv/ws')`, and `await vi.advanceTimersByTimeAsync(0)`, then reading `mcp` from the third argument of the `registerRemotePty` spy: one with `withMcp(managers, undefined)` asserting `mcp: false`, one with `withMcp(managers, MCP)` and `--offline` asserting `mcp: false`, and one with `withMcp(managers, MCP)` asserting `mcp: true`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/remote/manager.test.ts`, in `describe('remote spawn MCP flag')`, retitle the two cases so their names describe only the spawn-frame pass-through of the flag supplied to `createRemotePtySession`, removing the claims about the launch decision and the server-down rule; leave both bodies unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Leave every production file, the plan, and all other tests byte-for-byte unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The change adds no user-visible surface: it only pins the flag already forwarded on a remote spawn frame and corrects two test titles.

## Tests

In `src/harness/tab-spawn.test.ts`, colocated with the existing remote-launch case:

1. Requirement 1: a remote launch with `localLaunch()` returning undefined forwards `mcp: false` in the third `registerRemotePty` argument.
2. Requirement 2: a remote launch with `--offline` and a local MCP launch available forwards `mcp: false`.
3. Requirement 3: a remote launch with a local MCP launch available forwards `mcp: true`.

In `src/remote/manager.test.ts`, in `describe('remote spawn MCP flag')`:

4. Requirement 4: the false-flag pass-through case is titled for what it actually checks, with its body unchanged.
5. Requirement 5: the true-flag pass-through case is titled for what it actually checks, with its body unchanged.

## Out of scope

- Changing production code, including `src/harness/tab-spawn.ts`, `src/remote/pty-session.ts`, and `src/pseudoterminal-manager.ts`.
- Editing, moving, or deleting any existing test case other than the two titles named above.
- Working the remaining backlog entry about channel-close cleanup for the MCP relay.
- Spec, help, and documentation edits: behavior is unchanged, no command, flag, or key binding changes, and the user and developer documentation trees are owned by `update-documentation.md`.

## Verification

1. `$janissary/scripts/run.mjs check-diff` passes, including lint, the server typecheck, and the server test project.
2. Manual reading check: read the three new cases in `src/harness/tab-spawn.test.ts` and confirm each runs a remote harness command and asserts the `mcp` property of the third `registerRemotePty` argument — `false` for a missing launch, `false` for `--offline`, `true` with `withMcp(managers, MCP)`; read `describe('remote spawn MCP flag')` in `src/remote/manager.test.ts` and confirm the two titles now name only pass-through of a supplied flag, with bodies unchanged. Confirm `git diff` shows no production file changed. A failure looks like an assertion reading the wrong argument, a case that never reaches `registerRemotePty`, a title still claiming the launch decision, or any diff outside the two test files.
