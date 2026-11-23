# Correct where the recording-retention pull request says a shell tab is marked not recording

**Complexity: 1/10** — no production lines or files, 7 requirements, no test scenarios (p=3.04)

## Goal

The What section of pull request #2199 says the server-owned `recordingOff` flag is set "when a shell terminal is declined". That was true before the provisioning-shell repair. Now `openPluginTab` in `src/tab/openers.ts` marks the tab when it is minted, and `TerminalRuntimeManager.registerShellObservers` only withholds the runtime. A reviewer who trusts the sentence goes looking for a second writer in the runtime gate and either finds nothing or adds one. This plan rewrites that one clause so it names the right place and the right moment, and changes nothing else in the description.

## Requirements

1. "Rewrite only that clause so it says a tab of a plugin whose declaration asks for `recordsTerminal` is marked by `openPluginTab` in `src/tab/openers.ts` when the tab is minted": the clause names `openPluginTab`, `src/tab/openers.ts`, and the `recordsTerminal` declaration.
2. "before its first state broadcast": the clause says the mark lands before the tab's first state broadcast.
3. "so a shell still provisioning its clone or connection is covered too": the clause says a provisioning shell already reads not recording.
4. "while `TerminalRuntimeManager.registerShellObservers` in `src/terminal-runtime/manager.ts` only withholds the runtime and never marks the tab": the clause says the runtime gate withholds the runtime and does not mark the tab.
5. "leaving every other paragraph, every `Proof:` line, and the four pinned screenshot links byte-for-byte unchanged": only the one clause in the paragraph beginning "The change touches both server and web" differs from the body read before the edit.
6. The harness and ssh half of the clause, "set when a harness or ssh tab is created (so a provisioning tab is already covered)", keeps saying what it says now.
7. The corrected clause states no commit, file, or line counts and cites no commit SHA.

## Design decisions

- The Proposal's "before any terminal is started" is dropped. A shell factory can spawn its terminal before the tab is minted, so the claim is false in general. The clause says instead that the mark lands before the tab's first state broadcast and before any of its terminals is handed to recording, which the code does guarantee (Assumptions 2 and 3).
- The rest of the paragraph, including the sentence saying the shell gate moved into `registerShellObservers` and `TabManager` hands every declared terminal to it, stays as written. It is accurate and the entry does not name it (Assumption 4).
- The description is edited only after the plan commit is pushed, per Step 8 of `ai/tasks/feature/work-pull-request-issue.md`.
- The second backlog entry rewrites a different sentence in the same paragraph, the one about `reapHarnessRecordings` and `src/main.ts`. That sentence is left for its own run, so this edit doesn't collide with it.

## Preserved behavior

None found

## Assumptions

1. A recorded plugin's tab is marked as it is minted: `src/tab/openers.ts:160` `if (!getConfig().logEnabled && target.recordsTerminals(pluginId)) minted.recordingOff = true;`.
2. The mark runs inside the after-apply callback, before the state broadcast: `src/tab/openers.ts:52` `afterApply?.();` followed by `src/tab/openers.ts:53` `messageBus.emit('state', { type: 'dirty' });`.
3. Terminals are handed to recording after the mark: `src/tab/openers.ts:183` `for (const ptyId of terminalIds) target.recordTerminal(ptyId, minted.label, pluginId);`.
4. The runtime gate never writes the flag: `src/terminal-runtime/manager.ts:38` `if (!getConfig().logEnabled) return;` in `registerShellObservers`.
5. The open-time mark is pinned by `src/tab/manager.test.ts:312` `it('marks a recorded plugin\'s tab not recording from the moment it opens when logEnabled is false'`.
6. The gate leaving the tab unmarked is pinned by `src/terminal-runtime/manager.test.ts:34` `it('installs no shell runtime and leaves the tab unmarked when logEnabled is false'`.
7. The shell plugin asks to record: `src/plugins/shell/manifest.ts:32` `recordsTerminal: true,`.

## Existing functionality

1. The harness creation-time mark that the clause's first half describes: `src/harness/tab-spawn.ts:40` `if (!getConfig().logEnabled) tab.recordingOff = true;`.

## Implementation steps

1. **Record the plan and remove the backlog entry.** Move this plan to `product/plans/complete/` and remove the first entry from `product/backlog/pull-request.md`, leaving the second byte-for-byte unchanged. Commit and push to `feature/recording-retention-reaper`. Build command: `$janissary/scripts/run.mjs check-diff`.
2. **Edit the description.** Read the current body with `gh pr view 2199 --json body`. In the What paragraph that begins "The change touches both server and web", replace "and when a shell terminal is declined" with a clause saying a tab of a plugin whose declaration asks for `recordsTerminal` is marked by `openPluginTab` in `src/tab/openers.ts` when the tab is minted, before its first state broadcast and before any of its terminals is handed to recording, so a shell still provisioning its clone or connection is covered too, while `TerminalRuntimeManager.registerShellObservers` in `src/terminal-runtime/manager.ts` only withholds the runtime and never marks the tab. Write the full body to `./temp/pr-body.md` and apply it with `gh pr edit --body-file ./temp/pr-body.md`. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. None. The change is to the pull request description on GitHub; no application surface changes.

## Tests

This plan changes no application behavior and introduces no code, so it adds no tests. The behavior the clause describes is already pinned by the two tests in Assumptions 5 and 6.

## Out of scope

- Any source, test, spec, or help change.
- The second entry in `product/backlog/pull-request.md`, including the launch-sweep sentence in the same paragraph and the three `Proof:` lines it names.
- The pull request title.

## Verification

1. `$janissary/scripts/run.mjs check-diff`.
2. Read the updated description with `gh pr view 2199 --json body` and diff it against the body read before the edit. The only difference should be in the What paragraph that begins "The change touches both server and web", where "and when a shell terminal is declined" is replaced by the clause naming `openPluginTab` and `registerShellObservers`. Confirm `grep -n` finds `it('marks a recorded plugin\'s tab not recording from the moment it opens when logEnabled is false'` in `src/tab/manager.test.ts` and `it('installs no shell runtime and leaves the tab unmarked when logEnabled is false'` in `src/terminal-runtime/manager.test.ts`. A failure looks like any other changed line, a changed screenshot link, or the old "declined" wording still present.
