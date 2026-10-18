# Runscripts host topic and its actions
**Complexity: 4/10** — a new host topic across the contract, the topic source, and a new action module, with six actions whose origin rule, missing-file rule, and feed wording have to match the spec.

## Goal

Add `runscripts` as a host topic. It needs contract types, a source that reads rows, subscribes to the change signal, and returns an empty value, and an action module that runs execute, delete, clone, create, open, and the tab-open directory setup. Failures go to the notifications feed.

## Design decisions and dependencies

This subplan depends on `01-runscript-file-operations` (file helpers), `02-shared-runscript-execution` (`runRunscriptNow`), and `03-runscript-tick-refresh` (rows, protocol types, the `runscripts` bus channel).

- `NOTIFICATION_TOPICS` in `src/plugins/api-topics.ts` is typed as a record over the topic union. Adding `runscripts` to either one without a matching source in `TOPIC_SOURCES` in `src/plugins/topics.ts` fails typecheck. So the contract, the source, and the action module land together in this subplan.
- The topic's data is `{ rows }`, and each row carries `name`, `schedules`, and `open`. Rows are sorted by name.
- The topic has six actions. The source plan lists five: `execute`, `delete`, `clone`, `create`, and `open`. The sixth, `ensureDirectory`, is needed because creating `.janissary/` and `.janissary/scripts/` takes the project root, and a plugin cannot reach host modules. The command in `05` calls this action before it reads the topic, so the tab's first rows come from a directory that exists. Rejected: running the setup inside the topic read, which would make a read create directories.
- Every action that came from the client carries `origin`, the scripts tab's label. The plugin takes that label from the server-resolved tab, never from the client payload. The source plan says "each action payload carries the issuing tab's label", and this is how it is met.
- A name that fails `isRunscriptName` does nothing, which is what the source plan says for invalid names.
- A valid name whose file is absent gets the feed line `No runscript named "<name>".` and the next tick removes the row. The source plan says both "not in the catalog, do nothing" and "a row whose file has gone reports No runscript named", and those two statements conflict. This subplan keeps the second for valid names and reserves "do nothing" for invalid names. It is flagged for the owner.
- Failure text goes to the feed through `notify(managers, 'plugin-note', origin, text)`. That is the same event the plugin `notifyUser` capability uses, and its text is shown verbatim and is never suppressed by the ambient toggles. Actions return nothing, as the source plan requires.
- Open does not call `edit <name>`. The `edit` command resolves a bare name against the current directory of the tab and prefers an existing file of that exact name there, so a stray file called `deploy` next to the project would open instead of the runscript. The open action uses the exact path `.janissary/scripts/<name>.rs` with `openFile.edit`. For every other case the result matches `edit <name>`. Open focuses an existing editor tab for the same path, because `openEditorTab` already does that.
- Clone and create open the new file through the same editor call. Their transcript command text is `edit <new name>` for clone and `create script <name>` for create, which matches what the typed commands would show.
- The execute action calls `runRunscriptNow` and sends any returned text to the feed. It does not wait on the action, because `topicAction` is fire-and-forget.
- For the proposed wording of the directory failure, see the Proposed changes section. It is new text, so it needs the owner's confirmation.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Topic union, record, and action union | `src/plugins/api-topics.ts` (`TabPluginNotificationTopic`, `NOTIFICATION_TOPICS`, `TabPluginNotification`, `TabPluginTopicAction`) | Extended. The file is about 103 code lines. |
| Topic sources and routing | `src/plugins/topics.ts` (`TOPIC_SOURCES`, `subscribeTopic`, `readTopicData`, `emptyTopicData`, `runTopicAction`) | One new source entry. The file is about 160 code lines, so the action logic stays out of it. |
| Action module pattern | `src/plugins/schedule-topic-actions.ts` | Pattern for the new module. |
| Feed notifications | `src/notifications/index.ts` (`notify`, `EXPLICIT_EVENTS`, `notificationText`) | Called with `plugin-note`. |
| Execute | `src/commands/execute.ts` (`runRunscriptNow`, from `02`) | Called by the execute action. |
| File operations | `src/schedule/system/runscript-files.ts` (`deleteRunscript`, `cloneRunscript`, `newUntitledRunscript`, `ensureScriptsDirectory`, `readRunscript`, from `01`) | Called by the matching actions. |
| Editor open and dedupe | `src/open/file-manager.ts` (`edit`), `src/tab/open-editor-tab.ts` | Opens the file. An open editor tab for the same path is focused. |
| Name validation | `src/schedule/system/runscript.ts` (`isRunscriptName`) | Applied before any action runs. |
| Declared-topic check | `src/plugins/file-capabilities.ts` (`topicAction`, `requireDeclaredTopic`) | Reused. A plugin that did not declare `runscripts` cannot call its actions. |
| Topic test fixtures | `src/plugins/topics.test.ts`, `src/plugins/api-topics.test.ts` | Extended. |

## Proposed changes

- In `src/plugins/api-topics.ts`, add `runscripts` to the topic union and to the record. Add a `runscripts` variant to `TabPluginNotification` with `data` typed as `RunscriptsView` from `src/protocol.ts` and with `tabs`. Add `runscripts` variants to `TabPluginTopicAction`. Four of them (`execute`, `delete`, `clone`, `open`) carry `name` and `origin`. `create` carries `origin` only. `ensureDirectory` carries `origin` only. `TAB_PLUGIN_API_VERSION` stays at 2, because the change is additive. `src/plugins/api-capabilities.ts` is not touched.
- In `src/plugins/topics.ts`, add a `runscripts` entry to `TOPIC_SOURCES`. Its `subscribe` is `messageBus.on('runscripts', 'changed', fire)`. Its `read` returns `readRunscriptRows(managers)`. Its `act` calls the new action function. Its `empty` value is `{ rows: [] }`. This is the only change to `topics.ts`.
- In `src/plugins/runscript-topic-actions.ts` (new), define `runscriptTopicAction(managers, action)`, which returns `undefined`. It switches on the six action names and calls `runRunscriptNow`, `deleteRunscript`, `cloneRunscript`, `newUntitledRunscript`, `ensureScriptsDirectory`, or `openFile.edit`. It validates the name first, and it reports failures to the feed. If the module grows past about 180 code lines, move the editor-open helpers into `src/plugins/runscript-open.ts`.
- The feed texts are the following. Execute uses the text `runRunscriptNow` returns. Delete failure is `Could not delete runscript "<name>".`, and a missing file is `No runscript named "<name>".`. Clone failure is `Could not clone runscript "<name>".`, and a missing source is `No runscript named "<name>".`. Create failure is `Could not create runscript "<name>".`, where the name is the `runscriptName` that `newUntitledRunscript` attaches to its error, falling back to `untitled`. Open of a missing file is `No runscript named "<name>".`. A directory failure from `ensureDirectory` is proposed as `Could not use the runscripts directory.`, which is new wording and needs confirmation.
- In `src/plugins/api-topics.test.ts` and `src/plugins/topics.test.ts`, extend the existing cases as described under Tests. The record test changes from four to five existing topics plus `runscripts`.

## Tests

- In `src/plugins/runscript-topic-actions.test.ts` (new), with a temporary project directory and fake managers that record feed calls and editor calls:
  - Execute of a missing runscript posts `No runscript named "<name>".` with the origin label and enqueues nothing. Execute of a present runscript enqueues its lines to `system` and posts nothing. Execute with a system shell that is not ready posts nothing.
  - Delete removes the file and posts nothing. Delete of a missing file posts `No runscript named`. Delete of a symlink posts `Could not delete runscript "<name>".` and leaves the target in place.
  - Clone creates `<name>-2.rs`, opens it through the editor with the origin label, and posts nothing. Clone with a second copy taken creates `-3`. Clone of a missing source posts `No runscript named`. Clone that throws posts `Could not clone runscript "<name>".`.
  - Create on an empty directory creates and opens `untitled.rs`. A second create creates and opens `untitled-2.rs`. A failure posts `Could not create runscript "untitled".`
  - Open of an existing file where an editor tab for the same path is already open focuses that tab and creates no second tab. Open of a missing file posts `No runscript named`.
  - An invalid name, such as `Deploy`, `a--b`, or an empty string, does nothing and posts nothing for every action.
  - `ensureDirectory` creates `.janissary/` and `.janissary/scripts/`. With a symlinked `.janissary`, it posts the proposed directory wording and does not throw.
  - Every action returns `undefined`.
- In `src/plugins/topics.test.ts` (existing): the runscripts source reads `{ rows }` sorted by name, with `schedules` and `open` on each row; `subscribeTopic('runscripts', fire)` fires on `messageBus.emit('runscripts', { type: 'changed' })`; `runTopicAction` routes a runscripts action to the new module; and a plugin that did not declare `runscripts` is refused through the existing declared-topic check.
- In `src/plugins/api-topics.test.ts` (existing): the record carries the five existing topics, `schedules`, `conversations`, `sessions`, `databases`, and `tabs`, and also `runscripts`. `isTabPluginNotificationTopic('runscripts')` is true, and an unknown name is refused.

## Verification

Run `./scripts/run.mjs check-diff`. Check with `lint-files` that `src/plugins/topics.ts` and `src/plugins/api-topics.ts` stay within the 200-line limit. Check by diff that `src/plugins/api.ts` (about 198 code lines) and `src/plugins/api-capabilities.ts` are unchanged.

## Out of scope

- The plugin declaration, manifest, and intent routing. Those are in `05`.
- The client. Those are in `06` and `07`.
- Any new capability or any change to the topic API version.
- Any action beyond the six listed here. Rename, edit from a row, and scheduling from the tab are not part of this feature.
