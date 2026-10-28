# Remove `profile validate`

**Complexity: 2/10** — the subcommand is one module (`src/profile/validate.ts`) reached through one parser branch and one dispatch branch. The schema it ran stays, because `profile launch` runs the same check. The rest is text: the usage line, one launch message, two help pages, one spec, and one user-documentation page.

## Goal

Remove the `profile validate [<name>]` subcommand. After this change, `profile validate` and `profile validate <name>` are unknown subcommands. Like `profile bogus`, they get the top-level usage line, which becomes `Usage: profile launch <name> | profile list`. `profile launch` on a structurally broken file still opens nothing, and now reports only `Profile "<name>" is malformed.`, with no pointer to a command that no longer exists. `profile list` is unchanged.

## Approach

`src/profile/validate.ts` (`validateProfile`, `reportValidation`) exists only for the subcommand. `src/profile/manager.ts` imports it for its `validate` branch, and `src/profile/command.ts` parses `validate` into `{ action: 'validate'; name?: string }`. Deleting the module, both branches, and that arm of `ProfileParsed` removes the command.

The structural check validate ran is shared, so it stays. `collectProfileProblems` in `src/profile/schema.ts` (with `schema-fields.ts` and `schema-tab-entry.ts`) is what the loader `loadProfile` in `src/profile/file.ts` calls before every launch. `profileExists`, `listProfiles`, and `profileReadPath` in `src/profiles.ts` serve launch and list. Only the comments in `schema.ts` that name `profile validate` change.

### Scope decisions

1. **Boundary — the subcommand only.** Remove `profile validate` with and without a name, its module, its parser and dispatch branches, its `ProfileParsed` arm, and its tests. The loader and schema are untouched.
2. **Malformed launch message — drop the pointer only.** `profile launch` on a structurally broken file reports exactly `Profile "<name>" is malformed.`, removing ``Run `profile validate <name>` for details.`` No problem detail is added to the launch message. The loader keeps returning its first problem as `{ error }`, which the manager already discards.
3. **Schema cases in `validate.test.ts` — deleted with it.** The whole file goes, including the schema cases it exercised through `validateProfile`. The schema's remaining coverage is `src/profile/schema.test.ts` and `src/profile/file.test.ts`. The `src/**` coverage threshold in `vitest.config.ts` is an aggregate, not per file.
4. **User documentation — delete the section.** Delete "Checking a profile without launching it" from `documentation/user-documentation/automation/profiles.md`, and drop `profile validate writing-code` from the page's opening example. Add one sentence about the malformed message to the Relaunching section.
5. **Help wording — as proposed.** `help/profile.md`: the summary becomes "Launch a profile or list the available profiles.", and the `profile validate [name]` usage line and the "Check whether a profile is valid." use case are dropped. `help/commands.md`: the `profile` row ends "`profile list` lists the available profiles".
6. **Already decided by the task.** `profile validate` behaves as if it never existed: it is an unrecognized subcommand and gets the top-level usage line. Profile files on disk are untouched and need no handling; validate wrote nothing. Completed plans and `CHANGELOG.md` are not edited.

No remaining feature is built around validate. It is not an extension contract. No backlog entry and no screenshot definition concerns it.

## Implementation steps

1. **Command code.**
   - Delete `src/profile/validate.ts` and `src/profile/validate.test.ts`.
   - `src/profile/manager.ts`: remove the `reportValidation` import and the `validate` branch of `run`. The malformed line becomes `` out(`Profile "${parsed.name}" is malformed.`) ``.
   - `src/profile/command.ts`: remove the `validate` branch. `PROFILE_USAGE` becomes `Usage: profile launch <name> | profile list`.
   - `src/profile/types.ts`: remove `{ action: 'validate'; name?: string }` from `ProfileParsed`.
   - `src/profile/schema.ts`: reword the header comment so the schema is described as the loader's (`profile/file.ts`) all-or-nothing check, and reword the `TAB_TYPES` comment so the message order is the order the loader's `type must be one of …` problem lists, not "the wording `profile validate` prints".
2. **Tests of the profile command.**
   - `src/profile/command.test.ts`: delete `parses validate with a name`, `parses bare validate as validate-all (no name)`, and `lists validate in the usage string`.
   - `src/profile/manager.test.ts`: delete `routes the validate action to the validator`.
3. **Help.**
   - `help/profile.md`: per decision 5.
   - `help/commands.md`: the `profile` row becomes "Use `profile launch <name>` to launch a profile, or bare `profile launch` to pick one. `profile list` lists the available profiles".
4. **Specs** (see Spec updates).
5. **User documentation.** In `documentation/user-documentation/automation/profiles.md`:
   - Remove the `profile validate writing-code` line from the opening code block.
   - Delete the "Checking a profile without launching it" section, heading and both paragraphs.
   - In the Relaunching section, put this sentence before the closing "If a launch fails partway…" sentence: "A profile file whose structure is broken opens nothing and reports `Profile "<name>" is malformed.`"

No documentation page is deleted, so the docs-site sidebar, screenshots, and `scripts/docs-screenshots/manifest.mjs` are unchanged. The page keeps its three sprites, which still border prose.

## Tests

- Deleted with the feature: `src/profile/validate.test.ts`.
- Assertions about validate deleted from `src/profile/command.test.ts` and `src/profile/manager.test.ts`, as listed in step 2.
- No new test. `answers an unreadable command with the usage line and runs nothing` in `src/profile/manager.test.ts` already pins that an unknown subcommand gets `PROFILE_USAGE`, which is what `profile validate` now gets. `reports a malformed profile and opens nothing` and `reports an unrecognized tab type as malformed` already assert `Profile "<name>" is malformed.` and that nothing opens.
- `src/commands.test.ts` reads `help/commands.md` through `help commands` and checks row order and help pages. The `profile` row keeps its place.

## Spec updates

- `product/specs/profiles.md`:
  - Malformed profiles: drop "(suggesting `profile validate <name>` for detail)" from the `Profile "<name>" is malformed.` sentence.
  - Delete the `### profile validate [<name>]` section.
  - `profile` command paragraph: drop "; `profile validate [<name>]` checks one or every profile file against the schema", and the usage line becomes `Usage: profile launch <name> | profile list`.

## Verification

**Fast check** after each step: `$janissary/scripts/run.mjs check-diff`.

**Full checks** once removal is done, each as green as the baseline (typecheck clean; lint 0 errors, 14 warnings; tests 1005 files, 14367 passed, 1 skipped): `npm run typecheck`, `npm run lint`, `npm test`. A documentation page is edited, so `npm run docs:build` must also pass. `npm run check` is not run.

**Dead-code baseline** (`npm run knip`, before any removal). Every finding here is pre-existing and left alone; any finding the removal adds is removed:

```
Unused files (2)
src/plugins/file-capabilities.ts
src/search/matcher-worker-entry.ts
Unused exports (7)
AGENT_MONITOR_SCHEMA_VERSION            src/plugins/agent-monitor/shared.ts:1:14
isModelPair                             src/plugins/api.ts:470:10
inheritGroupName              function  src/tab/groups.ts:65:17
RemoteChip                              web/src/plugins/api.ts:72:10
diffIcon                                web/src/plugins/api.ts:94:145
dragging                      function  web/src/plugins/roles/roles-dnd.ts:44:17
diffIcon                                web/src/shared/icons.ts:39:19
Unused exported types (6)
EffortLevel           type  src/harness/effort-levels.ts:8:13
TabPluginLaunchReady  type  src/plugins/api.ts:40:27
RunscriptRowView      type  src/protocol.ts:95:15
AgentRunUpdatedEvent  type  src/protocol.ts:138:3
AppTerminal           type  web/src/plugins/api.ts:65:34
AppTerminalOptions    type  web/src/plugins/api.ts:65:52
Duplicate exports (1)
HARNESS_CLONE_DEPTH|AGENT_CLONE_DEPTH  src/workspace/clone-depth.ts
Configuration hints (1)
src/plugins/search/matcher-worker-entry.ts    knip.json  Remove from ignore
```

**Live check** of the one detached feature, the `profile` command's remaining subcommands, in a scratch instance driven through the attached browser. The scratch project gets a hand-written `profiles/notes.json` with one `editor` entry and a `profiles/broken.json` whose harness entry lacks `tool`.

- `profile validate notes` answers `Usage: profile launch <name> | profile list`.
- `profile launch broken` answers exactly `Profile "broken" is malformed.` and opens no tab.
- `profile list` lists `broken` and `notes` alongside the built-in profiles.
- `profile launch notes` opens the editor tab.

### Results

- Fast check green after every step. After step 1 it failed only on the four validate assertions that step 2 deletes.
- Full checks as green as the baseline: typecheck clean; lint 0 errors, 14 warnings; tests 1004 files, 14340 passed, 1 skipped. The one fewer file and 27 fewer tests are `validate.test.ts` (23) and the four validate assertions in `command.test.ts` and `manager.test.ts`. `npm run docs:build` passed.
- Dead-code scan after removal: identical to the baseline above, so no new finding to remove. A by-name search of every symbol the deleted module imported (`collectProfileProblems`, `profileReadPath`, `profileExists`, `listProfiles`) found each still used by `profile launch` or `profile list`.
- Live check: passed, in a scratch instance built from the working tree, with both browser variables present.
  - The scratch instance's activity log shows each reply as planned:
    - `profile validate notes` answered `Usage: profile launch <name> | profile list`.
    - `profile launch broken` answered `Profile "broken" is malformed.`, and the tab strip still held only `janus`.
    - `profile list` listed `broken` and `notes` before the built-in profiles.
    - `profile launch notes` answered `Opened editor tab.`
  - The browser showed a `notes.md` editor tab with the file's text.
  - The driver's reader of the visible tab body did not pick up the text replies, because the launch shell does not render them in that element's text. The app's own log is the evidence for those.

## Out of scope

- Any change to the loader or schema, including whether `collectProfileProblems` keeps collecting every problem now that only the loader reads it (decision 1).
- Adding problem detail to `profile launch`'s malformed message (decision 2).
- Moving the deleted schema cases into `schema.test.ts` (decision 3).
- Comments in remaining features' tests that say "validator" or "validated" about the schema, such as the comment above `collectProfileProblems over a malformed profile` in `src/profile/schema.test.ts`. They describe the schema check, which stays, and this task may only delete assertions about the removed feature.
- Migrating anything on users' machines, or a "this was removed" message for `profile validate`.
- Completed plans in `product/plans/complete/` and `CHANGELOG.md`, which are historical records.
