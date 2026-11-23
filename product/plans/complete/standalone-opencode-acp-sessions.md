# Run opencode ACP sessions in standalone mode

**Complexity: 2/10** — ~1 added line in one production file, 7 requirements and 5 test scenarios (p=4.15).

## Goal

Every ACP session that launches opencode should start its own private opencode server rather than attach to a shared background service. When Janissary itself runs under opencode, the server process carries `OPENCODE_*` routing and port variables; a child opencode that inherits that environment can attach back to the parent's service. The issue text is: "assure that acp sessions run opencode in standalone mode. in acpLaunchFor: build the env from a clean base, scrub those OPENCODE_* routing/port vars, and add the flag for belt-and-suspenders". The fix adds the documented `--standalone` flag to the opencode ACP launch and keeps the launch environment a clean literal, so every ACP consumer gets an isolated opencode process.

## Requirements

1. "assure that acp sessions run opencode in standalone mode." The opencode ACP launch runs with the `--standalone` flag ahead of `acp`, so opencode starts a private server for that process.
2. "add the flag for belt-and-suspenders" — The launch arguments are exactly `['--standalone', 'acp']`, in that order.
3. "build the env from a clean base, scrub those OPENCODE_* routing/port vars" — The opencode launch's environment contains only `OPENCODE_CONFIG_CONTENT`, built from the selected model, and no other `OPENCODE_*` variable.
4. Ambient `OPENCODE_*` routing/port variables in the server's environment never appear in the launch's returned environment.
5. A role entry that uses opencode gets the same `--standalone` flag through the existing delegation, while keeping the deny-all permission setting merged into `OPENCODE_CONFIG_CONTENT`.
6. The claude ACP launch keeps its existing command, arguments, and environment, with no `--standalone` flag.
7. Agent runs and remote-hosted role sessions carry the flag forward because they reuse the same launch definition.

## Design decisions

- Change the single opencode branch of `acpLaunchFor` in `src/acp/launch.ts`; it is the one definition of the opencode ACP launch, and `acpLaunchForEntry`, agent runs, and remote sessions all reuse it, so no other production module needs editing.
- Put `--standalone` before `acp` in the argument list, matching the issue's stated launch shape.
- Keep the environment as a fresh object literal holding only `OPENCODE_CONFIG_CONTENT`; do not spread the server's environment into it, which is what keeps ambient routing/port variables out. This rests on Assumption 5.
- Rely on the flag, not on version probing, to select standalone mode: ACP spawns the binary directly rather than through a shell, and the issue asks for the flag outright (see Assumptions 1 and 6).
- Do not add a separate scrub list of `OPENCODE_*` names: the clean literal already excludes every ambient variable, so a denylist would be a second mechanism with nothing to remove.

## Preserved behavior

1. A claude launch still uses `npx @zed-industries/claude-code-acp` with `ANTHROPIC_MODEL` and `CLAUDE_THINKING_EFFORT`, and must not gain the opencode flag — pinned by `src/acp/launch.test.ts` ("maps claude to its ACP adapter and model environment").
2. An opencode role entry still denies every built-in tool through `permission: 'deny'` in `OPENCODE_CONFIG_CONTENT` with no `sessionMeta`, and must not lose that denial when the args change — pinned by `src/acp/launch.test.ts` ("launches an opencode entry as an opencode persona with every permission denied").
3. A remote role session still opens its ACP agent over the channel with the launch's command, arguments, and environment, and must not spawn a local agent — pinned by `src/acp/manager.test.ts` ("backs the session with the channel and never spawns an agent locally"), updated for the new arguments.
4. The first role entry still launches on the first prompt with the model in its config and the deny-all setting, and must not change model selection — pinned by `src/acp/manager-fallback.test.ts` ("launches the role’s first entry for the first prompt, reading the role against the project root"), updated for the new arguments.

## Assumptions

1. `src/acp/launch.ts:20-26` defines the opencode ACP launch as `acpLaunchFor`, returning `command: 'opencode'`, `args: ['acp']`, and an `OPENCODE_CONFIG_CONTENT` literal — the single place the fix belongs.
2. `src/acp/launch.ts:58` delegates opencode role entries to `acpLaunchFor` through `baseLaunchForEntry`, so the flag reaches every role without another edit.
3. `src/agent/execute.ts:65-77` calls `acpLaunchFor` and forwards `launch.args` into both local and remote agent sessions, so agent runs inherit the flag.
4. `src/conversations/sessions.ts:31` spreads `acpLaunchFor` into the conversation launch, so conversations inherit the flag.
5. `src/acp/index.ts:41-57` merges the launch environment over the server environment before spawning; the launch's clean literal cannot by itself strip ambient variables, so the `--standalone` flag is what guarantees isolation (Requirement 1).
6. `src/harness/index.ts:30-38` documents `--standalone` as opencode's flag for a private server per process, which is the same guarantee the ACP launch needs.

## Existing functionality

1. `acpLaunchFor` in `src/acp/launch.ts:20-36` already maps each harness to its ACP command, arguments, and environment, which this fix extends.
2. `baseLaunchForEntry` in `src/acp/launch.ts:55-59` already routes opencode role entries through `acpLaunchFor`, giving one propagation path.
3. `internalToolDenial` in `src/acp/internal-tools.ts:61-62` already merges the deny-all permission into the base environment, so a clean literal composes with it unchanged.
4. `LAUNCH_ARGS` in `src/harness/index.ts:36-39` already names `--standalone` as opencode's private-server flag for harness tabs.

## Implementation steps

1. In `src/acp/launch.ts`, change the opencode branch of `acpLaunchFor` so its `args` are `['--standalone', 'acp']` and its `env` remains the fresh `OPENCODE_CONFIG_CONTENT` literal built from `harness.model`. Leave the claude branch and `acpLaunchForEntry` untouched. Build command: `$janissary/scripts/run.mjs check-diff`.
2. Update the three test sites that assert the old opencode arguments — `src/acp/launch.test.ts`, `src/acp/manager-fallback.test.ts`, and `src/acp/manager.test.ts` — and add a case in `src/acp/launch.test.ts` that stubs ambient `OPENCODE_*` routing/port variables and asserts the launch environment still holds only `OPENCODE_CONFIG_CONTENT`. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Update the launch paragraph of `product/specs/acp.md` so it says an opencode ACP launch runs `opencode --standalone acp` with a clean environment, and briefly why the flag is there. Check that no `help/` page or `documentation/user-documentation/` page describes the ACP launch command, and change none if so. Build command: `$janissary/scripts/run.mjs check-diff`.
4. Run the full diff-scoped check once more and confirm no file exceeds the 200-line limit. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user interface surface changes: the flag is a process launch detail, with no component, layout, key binding, state, or CSS attached to it.
2. The connection row and transcript for an opencode ACP session keep showing the same model and role as before; a successful standalone launch is not itself visible in the UI.

## Tests

1. In `src/acp/launch.test.ts`, update "maps opencode to its ACP command and model configuration" to expect `args: ['--standalone', 'acp']` and an environment containing only `OPENCODE_CONFIG_CONTENT` (Requirements 1, 2, 3).
2. Add a case in `src/acp/launch.test.ts` that stubs ambient `OPENCODE_SESSION_ID`, `OPENCODE_TERMINAL`, and `OPENCODE_PORT` and asserts the returned environment still has exactly one key, `OPENCODE_CONFIG_CONTENT` (Requirement 4).
3. In `src/acp/launch.test.ts`, update "launches an opencode entry as an opencode persona with every permission denied" to expect the standalone args while keeping `permission: 'deny'` in the config (Requirement 5).
4. Keep "maps claude to its ACP adapter and model environment" unchanged as the proof that claude gains no flag (Requirement 6).
5. Update `src/acp/manager-fallback.test.ts` ("launches the role’s first entry for the first prompt, reading the role against the project root") and `src/acp/manager.test.ts` ("backs the session with the channel and never spawns an agent locally") to expect the standalone arguments in the local and remote launch (Requirement 7).

## Out of scope

- No change to the harness tab launch in `src/harness/index.ts`, which already probes and passes `--standalone`.
- No rewrite of the environment merge in `src/acp/index.ts`; the issue's clean-launch plus flag approach leaves that shared path alone.
- No version detection or fallback for an opencode that rejects the unknown flag.
- No change to claude or codex launches, their adapters, or their environment variables.
- No new command, flag, key binding, help page, or user-documentation page.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. Manual check against the running app:

1. Start Janissary from a shell that exports `OPENCODE_SESSION_ID`, `OPENCODE_TERMINAL`, and `OPENCODE_PORT`, open a tab, and send an `ask` prompt whose entry uses opencode. Inspect the spawned process list (for example `ps -ef | grep 'opencode --standalone acp'`): the ACP child must show `--standalone` before `acp`. A failure looks like a child running plain `opencode acp` or one whose stderr reports attaching to an existing opencode service.
2. Send the same prompt with a claude entry and inspect its launch: it must still start the Claude Agent ACP adapter with no `--standalone` argument. A failure looks like the flag appearing in the claude launch or the claude adapter failing on an unknown argument.
