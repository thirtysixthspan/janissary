# Remove the newfile command

**Complexity: 2/10** — a pure removal: 0 lines added, 6 production files changed, 5 behavioral requirements, 4 test scenarios, 0 new units (p=4.28).

## Goal

Remove the `newfile` command-bar command and the editor `named` flag that existed only for it. After this change, typing `newfile …` is an unknown/unclaimed name, no help page, command-form declaration, registry entry, or documentation describes it, and every new file opened from the file navigator starts with the metadata-row rename session it always should. The `newdir` command and the file navigator's **New file** button remain fully working.

## Approach

`newfile` is a built-in command defined in `src/commands/new-file.ts`, registered in `src/commands/index.ts` and `src/commands/forms.ts`, and documented in `help/` and `documentation/`. Its `run` delegates to `OpenFileManager.newFile`, which nothing else calls — the file navigator creates files through the separate `fileNavigatorCreateFile` RPC (`src/controller/file/navigator.ts` → `createNavigatorFile`), so removing the command does not affect it.

The command's one deep tie is the editor-view `named` flag: `OpenFileManager.newFile` is the only producer, and `web/src/editor/new-file-rename.ts` is the only consumer, using it to skip the rename session that a default-named new file auto-starts. With the command gone the flag has no producer, so the flag, its client check, the three tests that assert it, and the two passages that document it are removed together. The remaining editor behavior is unchanged for every new file the navigator opens: `newFile === true` still starts the rename session.

The sibling `newdir` command shares the `OpenFileManager` class, the `nextFreeName` helper, and one documentation section; all of those stay, with only the `newfile`-specific lines removed. `nextFreeName` remains used by `newDirectory`.

## Scope decisions

All scope categories were settled with the user before removal:

- **Boundary:** command only. Remove the command-bar `newfile` command and the `OpenFileManager.newFile` helper only it uses. Keep the file navigator's **New file** button, menu entry, icon, CSS, RPC, protocol entries, and spec sections — the button uses `fileNavigatorCreateFile`, not this command.
- **Deep tie:** remove the editor `named` flag too. Delete `named?: boolean` from `EditorView`, reduce `opensRenameSession` to `editor.newFile === true`, delete the named-specific tests and the exception passages in `product/specs/editor-tab.md` and `documentation/user-documentation/tab-types/editor.md`.
- **Shared pieces:** trim only. Keep the "Create a file or directory" heading and its anchor in `opening-files.md`, and keep the `newdir` cross-reference link in the command-bar docs page. Delete only the `newfile` example, its two paragraphs, and its usage sentence.
- **User-visible wording:** drop references only. Remove `newfile` from the `$root`/`~` command list in `getting-started/tabs.md` and delete the `newfile` exception sentence in `editor.md`. Leave other shared wording, including "These commands don't expand wildcards", unchanged.
- **Backlog:** leave the RESOLVED entry in `product/backlog/documentation.md` that names `help/newfile.md` byte for byte. It records documentation debt resolved on 2026-11-19, not current behavior, and concerns `editor-tab`, not the command.

Decisions already made by the task, not re-asked: a removed name behaves as an unknown/unclaimed name; data already on users' machines is tolerated, not migrated; no deprecation shim or "removed" message is added; completed plans and changelog entries are never touched. No other backlog entry concerns `newfile`, and no persisted config key or state file is specific to the command — a stale `commands.json` entry for `newfile` is ignored by the settings decoder, and command history or schedules naming `newfile` are inert.

## Implementation steps

1. Delete `src/commands/new-file.ts` (the command definition).
2. `src/commands/index.ts` — remove the `newFile` import and its entry in `coreCommands`.
3. `src/commands/forms.ts` — remove the `newfile` declaration, keeping `newdir`.
4. `src/open/file-manager.ts` — remove the `newFile` method; keep `nextFreeName` (used by `newDirectory`), `resolveTabPath`, and `openInEditor`.
5. `src/open/file-manager.test.ts` — delete the `describe('OpenFileManager.newFile')` block; no import becomes orphaned (`writeFileSync` and `existsSync` are used by other blocks).
6. Delete `src/commands/new-file.test.ts`.
7. `src/tab/types.ts` — remove the `named?: boolean` field and its two-line comment from `EditorView`.
8. `web/src/editor/new-file-rename.ts` — reduce `opensRenameSession` to `return editor.newFile === true;` and update the comment so it no longer names `newfile`.
9. `web/src/editor/new-file-rename.test.ts` — delete the "skips the rename for a new file named when it was opened" case.
10. `web/src/editor/EditorTab.test.tsx` — delete the "a new-file tab named when it was opened focuses the buffer" case.
11. `web/src/editor/EditorMetaName.test.tsx` — delete the "does not auto-start the rename for a new file named when it was opened" case.
12. Delete `help/newfile.md`.
13. `help/commands.md` — remove the `| \`newfile <file>\` |` row.
14. `documentation/user-documentation/command-bar/commands.md` — remove the `newfile` row, keeping the `newdir` row and its `#create-a-file-or-directory` link.
15. `documentation/user-documentation/tab-types/opening-files.md` — remove the `newfile meeting notes.md` example line, the two `newfile` paragraphs, and the `Bare \`newfile\` reports \`Usage: newfile <file>\`.` part of the usage sentence; keep the heading, the `newdir` example and paragraph, and the other shared sentences.
16. `documentation/user-documentation/getting-started/tabs.md` — remove `newfile` from the list of commands accepting `$root`/`~`.
17. `documentation/user-documentation/tab-types/editor.md` — delete the `newfile <file>` exception sentences from the "Renaming a tab renames the file" paragraph; keep the navigator New file description.
18. `product/specs/editor-tab.md` — delete the paragraph beginning "A new file opened with the `newfile <file>` command is the exception"; keep the surrounding new-file rename behavior.
19. Leave `product/backlog/documentation.md` unchanged.
20. Run the dead-code scan and remove any finding created by the removal (Step 8); leave every finding present in the baseline below untouched.

Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

- Delete `src/commands/new-file.test.ts` — it tests only the removed command.
- `src/open/file-manager.test.ts` — delete the `OpenFileManager.newFile` describe block; leave the `edit`, `newDirectory`, `run`, and all other blocks unchanged.
- `web/src/editor/new-file-rename.test.ts`, `EditorTab.test.tsx`, `EditorMetaName.test.tsx` — delete only the assertions about a `named` new file; leave the default-named new-file rename assertions unchanged.
- `src/commands.test.ts` — no edit. Its "has a help page for each command row and no orphan command pages" test stays green because the `help/` row and page are deleted together; its registry-priority and fixed-subcommand tests iterate the registry/table.
- `src/application-commands.parity.test.ts` — no edit. Registry entry, form declaration, and generated command rows all lose `newfile` together, keeping parity green.
- `scripts/release/changelog.test.mjs` — no edit. Its `newfile` string is a fixture for parsing a historical changelog line.

No other test asserts anything about `newfile` or `named`.

## Spec updates

- `product/specs/editor-tab.md` — remove the `newfile <file>` exception paragraph; the rest of the "New files" rename behavior stays.
- `product/specs/file-navigator-tab.md` — no change; its New file section describes the navigator RPC, which stays.
- Completed plans under `product/plans/complete/`, `product/backlog/documentation.md`, and `CHANGELOG.md` are historical records and are not edited.

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
NO_ASK_MODEL                            src/acp/ask-role.ts:12:14
AGENT_MONITOR_SCHEMA_VERSION            src/plugins/agent-monitor/shared.ts:1:14
isModelPair                             src/plugins/api.ts:470:10
inheritGroupName              function  src/tab/groups.ts:65:17
dragging                      function  web/src/plugins/roles/roles-dnd.ts:32:17
Unused exported types (19)
AskModels                  type  src/acp/ask-role.ts:18:13
AskRoleSettingsReader      type  src/acp/ask-role.ts:21:13
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

- Full: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run docs:build` (documentation pages and the docs-site command reference are affected, so the docs build must pass).
- Fast after each step: `$janissary/scripts/run.mjs check-diff`.
- Dead-code: `npm run knip` re-run and compared against the baseline above.
- Live feature check: the editor new-file rename behavior was detached from the removed `named` flag. Confirm both browser prerequisites exist (`JANISSARY_BROWSER_WS_ENDPOINT`, `JANISSARY_PLAYWRIGHT`), then start a scratch instance with `start-application.md` under `./temp/remove-an-existing-feature/` and drive it once with `e2e-driver`: open a `files` tab, click **New file**, and confirm the editor opens with the metadata-row filename selected for rename; type a name, press Enter, and confirm the label and metadata row update and focus returns to the editor buffer. Record the observations in the driver's `record`. Stop the instance with `stop-application.md`. If a prerequisite is missing, record the reason and skip rather than launching a browser.

## Out of scope

- The file navigator's **New file** button, its icon and CSS, the `fileNavigatorCreateFile` RPC, `createNavigatorFile`, `newFileTargetDir`, and the navigator spec sections — all stay, per the settled boundary.
- `newdir`, its help page, docs, and `OpenFileManager.newDirectory`, plus the shared `OpenFileManager` class and `nextFreeName` helper.
- Migration or cleanup of persisted `commands.json` settings, command history, or schedules that may still contain the text `newfile` — tolerated by the existing decoders.
- The RESOLVED backlog entry naming `help/newfile.md`, completed plans, and `CHANGELOG.md` — historical records.
- Other `named` concepts (tab display aliases, renamed files, monitor names); only `EditorView.named` is in scope.

## Rebase adaptation

After this pull request was opened, master merged "feat(commands)!: remove the newdir command" (72353dfb), which removed `newdir` from the same command registry entry, command-form declaration, help table row and page, documentation passages, and `OpenFileManager` helper and tests that this plan was trimming around. The rebase conflicts were resolved by applying both removals: `newfile` is gone per this plan and `newdir` stays gone per master. The instructions above to keep the `newdir` row, example, and paragraph, and to keep `nextFreeName` because `newDirectory` uses it, no longer apply — master had already removed `newDirectory`, so `OpenFileManager`'s now-unused `nextFreeName` import was removed with it. The stale `newfile meeting notes.md` example in the shared "Relative paths" sentence of `opening-files.md` was also dropped. The plan's goal — removing the `newfile` command and the editor `named` flag — is unchanged and fully met.
