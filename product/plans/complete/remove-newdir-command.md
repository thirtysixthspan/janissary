# Remove the newdir command

**Complexity: 2/10** — a pure removal: 0 lines added, 4 production files changed, 4 behavioral requirements, 3 test scenarios, 0 new units (p=3.92).

## Goal

Remove the `newdir` command-bar command. After this change, typing `newdir …` is an unknown command and behaves like any other unrecognized input; no help page, command-form declaration, registry entry, or documentation describes it. The file navigator's **New folder** button and the `newfile` command remain fully working.

## Approach

`newdir` is a built-in command defined in `src/commands/new-directory.ts`, registered in `src/commands/index.ts` and `src/commands/forms.ts`, and documented in `help/` and `documentation/`. Its `run` delegates to `OpenFileManager.newDirectory`, which nothing else calls — the file navigator creates directories through the separate `fileNavigatorCreateDirectory` RPC (`src/controller/file/navigator.ts` → `createNavigatorDirectory` in `src/file-navigator/manager/files.ts`), so removing the command does not affect it. Removing the command source, its registrations, its help and docs, and the now-orphaned helper leaves no references behind. The sibling `newfile` command shares the `OpenFileManager` class, `nextFreeName`, `resolveTabPath`, and one documentation section; all of those stay, with only the `newdir`-specific lines removed.

## Scope decisions

All four scope categories were settled with the user before removal:

- **Boundary:** command only. Remove the command-bar `newdir` command and the `OpenFileManager.newDirectory` helper only it uses. Keep the file navigator's **New folder** button, menu entry, icon, CSS, RPC, protocol entries, and spec section — the button uses `fileNavigatorCreateDirectory`, not this command.
- **Touch points:** remove the dead helper. Delete `OpenFileManager.newDirectory`, its three tests, and the now-unused `mkdirSync` import rather than leaving them for a later hygiene task.
- **Shared pieces:** trim only. Keep the "Create a file or directory" heading and its anchor in `opening-files.md`, and keep the `newfile` cross-reference link in the command-bar docs page. Delete only the `newdir` example, paragraph, and usage sentence.
- **User-visible wording:** drop the name only. Remove `newdir` from the `$root`/`~` command list in `getting-started/tabs.md`; leave other shared wording (for example "These commands don't expand wildcards") unchanged.

Decisions already made by the task, not re-asked: a removed name behaves as an unknown command; data already on users' machines is tolerated, not migrated; no deprecation shim or "removed" message is added; completed plans and changelog entries are never touched. No backlog entry concerns `newdir`, no deep tie exists, and no persisted config key or state file is specific to the command — a stale `commands.json` entry for `newdir` is ignored by the settings decoder, and command history/schedule text naming `newdir` is inert.

## Implementation steps

1. Delete `src/commands/new-directory.ts` (the command definition).
2. `src/commands/index.ts` — remove the `newDirectory` import (line 27) and its entry in `coreCommands` (line 76).
3. `src/commands/forms.ts` — remove the `newdir` declaration (line 14), keeping `newfile`.
4. `src/open/file-manager.ts` — remove the `newDirectory` method (lines 105–110) and drop `mkdirSync` from the `node:fs` import; keep `nextFreeName` and `resolveTabPath` (used by `newFile`).
5. `src/open/file-manager.test.ts` — delete the `describe('OpenFileManager.newDirectory')` block (lines 288–322) and any import it alone needed.
6. Delete `src/commands/new-directory.test.ts`.
7. Delete `help/newdir.md`.
8. `help/commands.md` — remove the `| \`newdir <directory>\` |` row (line 34).
9. `documentation/user-documentation/command-bar/commands.md` — remove the `newdir` row (line 15), keeping the `newfile` row and its `#create-a-file-or-directory` link.
10. `documentation/user-documentation/tab-types/opening-files.md` — remove the `newdir draft notes` example line (95), the `newdir <directory>` paragraph (102), and the `Bare newdir …` usage sentence (108); keep the heading, the `newfile` content, and the other shared sentences.
11. `documentation/user-documentation/getting-started/tabs.md` — remove `newdir` from the list of commands accepting `$root`/`~` (line 205).
12. Run the dead-code scan and remove any finding created by the removal (Step 8); leave every finding present in the baseline below untouched.

Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

- Delete `src/commands/new-directory.test.ts` — it tests only the removed command.
- `src/open/file-manager.test.ts` — delete the `OpenFileManager.newDirectory` describe block; leave the `newFile`, `run`, and all other blocks unchanged.
- `src/commands.test.ts` — no edit. Its "has a help page for each command row and no orphan command pages" test stays green because the `help/` row and page are deleted together; its registry-priority tests iterate the registry.
- `src/application-commands.parity.test.ts` — no edit. Registry entry, form declaration, and the generated command rows all lose `newdir` together, keeping the parity checks green.
- `scripts/release/changelog.test.mjs` — no edit. Its `newdir` string is a fixture for parsing a historical changelog line, not a reference to the command.

No remaining feature's test asserts anything about `newdir`, so no other test edit is needed.

## Spec updates

None. No spec describes the `newdir` command: `product/specs/application-commands.md` does not name it, and `product/specs/file-navigator-tab.md`'s "Creating a new directory" section documents the navigator's New folder button via its RPC, which stays. Completed plans under `product/plans/complete/` and `CHANGELOG.md` are historical records and are not edited.

## Verification

Complete dead-code baseline captured before removal (`npm run knip`). Every finding below pre-existed the removal and is left alone:

```
Unused files (2)
src/file-grep/filter-worker-entry.ts
src/search/matcher-worker-entry.ts
Unused dependencies (2)
@agentclientprotocol/claude-agent-acp  package.json:103:6
@agentclientprotocol/codex-acp         package.json:104:6
Unlisted dependencies (1)
lightningcss  web/src/stylesheets-minify.test.ts:4:27
Unlisted binaries (2)
ffmpeg  src/plugins/video/snapshot-ffmpeg.test.ts
ffmpeg  src/plugins/video/snapshot-ffmpeg.ts
Unused exports (5)
NO_ASK_MODEL                            src/acp/ask-role.ts:11:14
AGENT_MONITOR_SCHEMA_VERSION            src/plugins/agent-monitor/shared.ts:1:14
isModelPair                             src/plugins/api.ts:470:10
inheritGroupName              function  src/tab/groups.ts:65:17
dragging                      function  web/src/plugins/roles/roles-dnd.ts:32:17
Unused exported types (19)
AskModels                  type  src/acp/ask-role.ts:17:13
AskRoleSettingsReader      type  src/acp/ask-role.ts:20:13
EffortLevel                type  src/harness/effort-levels.ts:8:13
CommandsTopicAction        type  src/plugins/api.ts:38:15
CommandsTopicSetAction     type  src/plugins/api.ts:38:63
ConnectionsTopicAction     type  src/plugins/api.ts:39:15
ModelsTopicAction          type  src/plugins/api.ts:40:15
ModelsTopicDeleteAction    type  src/plugins/api.ts:40:34
TabPluginLaunchReady       type  src/plugins/api.ts:42:27
ConnectionsIntent          type  src/plugins/connections/shared.ts:59:13
ConnectionsTopicData       type  src/protocol.ts:22:3
ConnectionsTopicLiveRow    type  src/protocol.ts:23:3
ConnectionsTopicRecordRow  type  src/protocol.ts:24:3
ConnectionsTopicRow        type  src/protocol.ts:25:3
ConnectionsTopicWindow     type  src/protocol.ts:26:3
RunscriptRowView           type  src/protocol.ts:103:15
MonitorView                type  src/protocol.ts:139:3
AgentRunUpdatedEvent       type  src/protocol.ts:150:3
TabViewUpdatedEvent        type  src/protocol.ts:151:3
Duplicate exports (1)
HARNESS_CLONE_DEPTH|AGENT_CLONE_DEPTH  src/workspace/clone-depth.ts
Configuration hints (1)
src/plugins/search/matcher-worker-entry.ts    knip.json  Remove from ignore
```

Live checks Step 9 will make:

- Full: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run docs:build` (documentation pages are edited, so the docs build must pass).
- Fast after each step: `$janissary/scripts/run.mjs check-diff`.
- Dead-code: `npm run knip` re-run and compared against the baseline above.
- Live feature check: none — no remaining feature was detached. The navigator's New folder uses its own RPC and `newfile` keeps every shared helper unchanged; no command, key binding, or protocol behavior of a remaining feature was altered.

## Out of scope

- The file navigator's **New folder** button, its icon and CSS, the `fileNavigatorCreateDirectory` RPC, `createNavigatorDirectory`, `newDirectoryTargetPath`, `findPendingNewDir`, and the "Creating a new directory" spec section — all stay, per the settled boundary.
- `newfile` and its help page, docs, `OpenFileManager.newFile`, and the shared `OpenFileManager` class, `nextFreeName`, and `resolveTabPath` helpers.
- Migration or cleanup of persisted `commands.json` settings, command history, or schedules that may still contain the text `newdir` — tolerated by the existing decoders.
- Completed plans and `CHANGELOG.md`, which record history rather than current behavior.
