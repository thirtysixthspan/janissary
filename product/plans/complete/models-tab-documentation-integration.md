# Models tab documentation and integration

**Complexity: 3/10** — this closes the user-facing help, documentation, and navigation gaps, reconciles catalog guidance, and runs the end-to-end acceptance flow across completed slices.

## Goal

Finish the feature's public help and user documentation, reconcile remaining cross-feature descriptions with the delivered behavior, and verify the completed models workflow in a scratch project.

## Decisions and dependencies

- Depends on all preceding models catalog, host topic, models tab, and roles subplans.
- Help pages are the source for generated command reference pages. Do not edit generated documentation output.
- User documentation is written for a Janissary user and must not include internal module names or implementation paths.
- Add the new page to VitePress navigation and the existing command/plugin/tab discovery pages; an unlinked page is not a complete user-facing integration.
- The full feature's `models-tab` spec, harness, roles, ACP, notification, and tab-plugin specs are created or updated by their implementation subplans. This plan updates only remaining descriptions needed for a coherent public workflow.

## Existing code and docs to reuse

| Need | Existing page |
| --- | --- |
| Help table conventions | `help/commands.md` and `src/commands.test.ts` |
| Roles help and user docs | `help/roles.md` and `documentation/user-documentation/tab-types/roles.md` |
| Conversation model-source description | `documentation/user-documentation/tab-types/conversations.md` |
| Models catalog user guidance | `documentation/user-documentation/advanced-agents/harness.md` |
| Models refresh notification settings | `documentation/user-documentation/tab-types/notifications.md`, `documentation/user-documentation/getting-started/configuration.md`, and the notifications row in `documentation/user-documentation/command-bar/commands.md` |
| Page navigation and command discovery | `documentation/.vitepress/config.mts`, `documentation/user-documentation/command-bar/commands.md`, `command-bar/plugins.md`, and `getting-started/tabs.md` |
| User documentation structure and writing rules | `documentation/user-documentation/tab-types/`, `ai/guidelines/user-documentation.md`, and `ai/guidelines/human-writing-guidelines.md` |

## Proposed changes

1. Add `help/models.md` with the exact command syntax, center/left/right behavior, provider groups, Refresh and Delete actions, and key user-visible messages. Add the `models` command row alphabetically after `layout` and before `monitor` in `help/commands.md`; keep `src/commands.test.ts` passing. Update `help/roles.md` to describe editing role choices without a catalog column or drag-in path and point users to the Models command for catalog changes.
2. Add `documentation/user-documentation/tab-types/models.md` as a task-focused page with runnable commands near the top. Explain docking, provider groups, Refresh, Delete, hidden versus disabled models, where project overrides live, and how failed/stale Delete actions appear. Use observable user behavior only; omit implementation module names, internal APIs, and code paths. Update `documentation/user-documentation/tab-types/roles.md` to remove the Models column and drag-to-add/remove instructions, explain enabled-model choices and the missing-entry tooltip, and preserve role editing/reordering details. Update `documentation/user-documentation/tab-types/conversations.md` to explain that its selector offers enabled catalog models and falls back when a saved pair becomes unavailable.
3. Surface the page and command in existing discovery paths: add Models to the Tab Types navigation in `documentation/.vitepress/config.mts`, add the `models [left|right]` row and link to `documentation/user-documentation/command-bar/commands.md`, add the Models tab to the plugin list and command examples in `documentation/user-documentation/command-bar/plugins.md`, and include it in the dockable-view list in `documentation/user-documentation/getting-started/tabs.md`. Update the same command page's notifications description to mention completed Models refreshes.
4. Update `documentation/user-documentation/tab-types/notifications.md` and `documentation/user-documentation/getting-started/configuration.md` for the `modelsRefresh` default-on explicit toggle, its focus bypass, and the success alert default. Add it to the notification toggle example/table and configuration settings table, and change references to five event toggles to six. Keep the four ambient toggles distinguished from the two default-on explicit toggles.
5. Reconcile `documentation/user-documentation/advanced-agents/harness.md`: replace the claim that the catalog is maintained only by hand with guidance to refresh it from the Models tab; describe `.janissary/known-models.json` as ordered model records rather than id strings; distinguish hand edits, which are read on the next Models command/Delete/Refresh, from Refresh, which updates provider data. Keep the existing project-override and warning guidance accurate.
6. Review the affected help and user-doc sections against the final code and specs, including all command examples, links, and headings. Search for stale claims that roles contain a Models column or accept model drags, that the catalog is id-only or manually refreshed only, that notification settings omit the Models refresh toggle, and that model choices are sourced outside the Models catalog. Correct remaining stale wording without widening feature scope.
7. Perform the final scratch-project acceptance flow from the source plan. Start with no project override, seed one role entry that refers to a model you will delete, open `models`, and confirm the provider groups, four columns, Refresh, and split controls. Dock with `models left` and confirm the two-line rows and dock-cycle control; repeat on the right if available, then return to center with bare `models`. Cancel a Delete and confirm its row stays; confirm a second Delete, inspect `.janissary/known-models.json` for both true flags, verify `harness claude --model <deleted-id>` is refused, and check the seeded role entry is dimmed with the `Not in the model catalog` tooltip without being removed. With the notifications feed closed, press Refresh and confirm its spinner, updated rows, and toast. Repeat after unsetting `ANTHROPIC_API_KEY`; confirm the notice says `claude skipped: ANTHROPIC_API_KEY is not set.` and the Anthropic group remains unchanged. In isolated scratch states, check an empty visible catalog, an invalid `models` argument, a stale Delete after hand-editing a record to hidden or disabled, and a hand edit becoming visible on the next `models` command. Use only scratch state and installed providers; do not expose credentials or capture screenshots containing them.

## Tests and verification

Run `$janissary/scripts/run.mjs check-diff` after each documentation change that affects tracked code-like files, and at the end run `$janissary/scripts/run.mjs check-diff`. Confirm `src/commands.test.ts` accepts the alphabetical help row and every internal link resolves in the documentation build. Complete the scratch-project acceptance flow and verify every manual expectation against the final specs. Do not run `npm run check`.

## Out of scope

- Source or test behavior changes; if acceptance reveals a code defect, stop this documentation subplan and add a separately planned repair before resuming it.
- Screenshots, publishing or merging the PR, generated Command Reference output, or changes to unrelated help pages.

## Completion

- Added Models help and user documentation, linked the page through navigation and discovery, and updated Roles, Conversations, harness catalog, and notification settings guidance to match the delivered behavior.
- `npm run docs:build` passed and `./scripts/run.mjs check-diff` passed (`test:help`). The app build also passed for scratch acceptance.
- The scratch UI acceptance flow passed for center and docked layouts, refresh status and toast, cancellation and deletion, role missing-model display, disabled-model launch refusal, empty and invalid states, stale deletion, and hand-edited catalog reload. Anthropic was skipped with the expected missing-key notice and remained unchanged; Codex refreshed. OpenCode returned `Command failed: opencode models.`, which the tab reported as a provider failure.
