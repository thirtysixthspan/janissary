# Correct the disabled-command step to stop expecting a suppressed notification

**Complexity: 1/10** — no production lines or files, one requirement (rewrite one verification step), no test scenarios or new units (p=2.07).

## Goal

Pull request #1992's description step 21 claims a `command-disabled` notification appears when a typed `file read` is refused because it is disabled. The behavior is correct, but that notification is not displayed under the defaults the step asks the reader to use, so a reviewer following the step looks for something that never appears and may report the feature as broken.

Correct only that step's wording so it states the exact refusal line and explains that the event is raised but no notification is shown under the default configuration.

## Existing behavior, verified against the code

- A typed command goes through `CommandManager`, which calls `refuseDisabledCommand` in `src/native-commands/dispatch-policy.ts`. That function returns `Command is disabled: <name>.` and calls `notify(managers, 'command-disabled', label, message)` — the event is raised.
- `notify` in `src/notifications/index.ts` asks `shouldNotify` first. `command-disabled` is an ambient event, so `shouldNotify` returns false when the tab is the active one, and otherwise returns the configured `notifications.events.commandDisabled` toggle.
- The default configuration in `src/config.ts` sets `commandDisabled: false`. The verification step runs in the shell tab, which is active, so both suppression rules independently reject the notification: nothing is queued, nothing is toasted, and nothing reaches the feed.
- The command output itself is stable: `disabledCommandMessage` produces exactly `Command is disabled: file read.` from the native-command row's name.

## Approach

Description-only correction. The pull request's "How to verify" step 21 is rewritten to assert the exact output line, state that the refusal raises the command-disabled event, and state that the default configuration suppresses the notification (`notifications.events.commandDisabled` off; the shell tab is active). The step keeps its instruction to turn `Enabled: file read` back on.

No code, tests, specs, or help pages change: the implementation is correct and the documented default behavior is intentional. The description's word "appears" is the error.

## Implementation steps

1. Read the current pull request body with `gh pr view https://github.com/thirtysixthspan/janissary/pull/1992 --json body`.
2. Replace only verification step 21's Do/Expect lines with the corrected wording, keeping the step's title and every other character of the body unchanged, including step 22's separate notification claim.
3. Write the full revised body to `./temp/pr-body.md` and apply it with `gh pr edit https://github.com/thirtysixthspan/janissary/pull/1992 --body-file ./temp/pr-body.md`.
4. Do not touch the title or any other paragraph.

The corrected step 21 reads:

> **21. Disabled command, typed**
> Do: In the Commands tab, turn off **Enabled: file read**. In the shell tab, type `file read notes/sample.md` and press Enter.
> Expect: Exactly `Command is disabled: file read.` The refusal raises the command-disabled event, but under the default configuration (`notifications.events.commandDisabled` is off and the shell tab is the active tab) no notification is displayed. Turn **Enabled: file read** back on afterwards.

## Tests

None. The remedy is a description correction; the implementation already has coverage for the refusal text and the notification rules (`src/command/manager.test.ts`, `src/controller.test.ts`, `src/notifications/index.test.ts`), and this change alters neither. `$janissary/scripts/run.mjs check-diff` is expected to report no changes to lint, typecheck, or test.

## Specs

None. No user-visible behavior changes. `product/specs/` already describes the command-disabled notification and its ambient toggle accurately.

## Help and documentation

None. No command, flag, default, or behavior changes, so `help/` and `documentation/user-documentation/` are untouched.

## Out of scope

- Changing the notification rules or the default `commandDisabled` toggle. Raising the event while suppressing its display under these defaults is intended.
- Correcting step 22's separate claim that a `command-disabled` notification appears for an `Agent access` refusal. The work item names step 21 only.
- Any code, test, spec, or help change.
- Merging or closing the pull request.

## Verification

1. `$janissary/scripts/run.mjs check-diff` — expected to pass with no production changes.
2. Diff the published body against the original: exactly one step's Do/Expect text differs, and every other character, including the title and step 22, is unchanged.
3. Confirm the pull request remains `OPEN` with head `feature/acp-tool-loop-far-side`.
