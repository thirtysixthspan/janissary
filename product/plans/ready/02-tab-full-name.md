# Add a shared tab full-name helper

**Complexity: 1/10** — one pure helper, one local-expression replacement in `TabItem`, and a small pure-helper test. No state, effect, protocol, persistence, or server change; the existing tab-strip tests already cover all three fallbacks.

## Goal

Add `tabFullName(tab: TabView): string` to a new `web/src/shared/tab/tab-name.ts`. It returns the name the tab strip treats as the tab's full name: the editor's file name when the tab has one, otherwise the tab's title, otherwise its label. `TabItem` uses it in place of its inline expression. The quit walk uses it in subplan `06` for its dialog title.

`web/src/TabItem.tsx:47` is the only current occurrence of that three-step expression; the other tab-name helpers in the repo stop at title-or-label and are listed below.

The helper is created in `shared/` because the walk is its second consumer, not in anticipation of one, per `ai/guidelines/react-code-organization.md` §2. It stays free of feature-specific branches.

## Dependencies and ordering

This subplan depends on nothing earlier. It can land before or after `01-move-unsaved-work-modules`: it touches `web/src/TabItem.tsx` and adds files under `web/src/shared/tab/`, none of which `01` moves. Subplan `06-quit-walk-guard` depends on it, and subplan `03-save-walk-pure-module` does not: `walkTitle` takes a name string, so the tab-to-name step stays at the caller.

## Design decisions

- `TabView` is declared at `src/protocol/tab.ts:70` and re-exported by `src/protocol.ts:135`. `label` is a required `string` (`:73`), `title` is optional (`:110`), and `editor` is optional (`:119`); when `editor` is present its `name` is a required `string` (`src/tab/types.ts:129`).
- The helper has the exact nullish-coalescing order the tab strip uses today at `web/src/TabItem.tsx:47` (`const fullName = tab.editor?.name ?? tab.title ?? tab.label;`): editor name, then title, then label. It keys off the presence of `tab.editor`, not `tab.view === 'editor'`; the current expression does not inspect `view`, and switching to a view guard would change behavior for any view carrying an editor payload.
- Editor tabs normally carry `title === editor.name` because creation copies `view.name` into both (`src/tab/creators.ts:50`) and a rename updates both (`src/tab/rename-editor.ts:63-64`), so a title-first helper can look correct in casual use. Do not simplify to `displayLabel`'s title-then-label rule: `web/src/TabStrip.test.tsx:186` deliberately makes the two differ and asserts the editor name.
- The fallback is nullish, not truthiness. An empty editor name is returned as `''` rather than falling through to the title; an empty `title` is returned as `''` rather than falling through to the label. Do not trim, normalize, or replace empty strings. The supported rename and plugin-title paths do not store an empty title — an empty rename clears the field (`src/tab/rename.ts:31-32`) and a blank plugin title is rejected (`src/plugins/tab-value.ts:29`) — but the type permits it, so the helper and its tests pin the nullish contract rather than relying on that invariant.
- The helper takes a `TabView` and returns a `string`. It does not know about dirty state, docking, visibility, or the walk, and it is not a server-side tab-name rule: the server's `Tab` type and the existing title-or-label helpers below keep their own contracts.
- `TabItem` keeps one local `fullName` value per render, now assigned from `tabFullName(tab)`. That value still feeds `displayName` (`web/src/TabItem.tsx:48`) and the rename draft in `startEdit` (`:49`). The commit handler at `:51-56` continues to send the user-edited `draft` to `onRename`; it must not call `tabFullName(tab)`, or edits typed into the rename field would be discarded.
- No other component or module is changed. `truncateTabLabel` keeps its own job in `web/src/tab-label.ts:1`; the helper does not truncate.
- The new module is a pure shared module with no feature or app-shell import. Its only dependency is a type-only `TabView` import from `@shared/protocol`. In the web client that alias resolves to `../src` through `web/tsconfig.json:14` and `web/vite.config.ts:51`, with the same mapping for Vitest at `vitest.config.ts:73`; existing `web/src/shared/tab/visible-tabs.ts:2` uses that alias the same way. Web imports carry no `.js` extension — the NodeNext extension rule applies to `src/`, not `web/src/`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Inline full-name expression | `web/src/TabItem.tsx:47` (`const fullName = tab.editor?.name ?? tab.title ?? tab.label;`) | Replaced by a call to the new helper. The expression is the contract being preserved. |
| Tab display truncation | `web/src/tab-label.ts:1` (`truncateTabLabel`) | Unchanged. `TabItem` still calls it with the helper's result. |
| Tab wire shape | `src/protocol/tab.ts:70` (`TabView`; `label` at `:73`, optional `title` at `:110`, optional `editor` at `:119`), re-exported at `src/protocol.ts:135` | The helper imports the type; no new wire shape. |
| Editor name | `src/tab/types.ts:129` (`name: string` on `EditorView`) | The first fallback the helper reads. |
| Existing title-or-label helpers (not reused) | `web/src/pickers/tab-nav-match.ts:8` (`displayLabel`), `src/sessions/snapshot.ts:25` (`tabName`) | They deliberately stop at title/label and have consumers outside the tab strip. Leave them unchanged; this helper must add the editor-name step rather than replace them. |
| Pure-helper fixture style | `web/src/shared/tab/view-guards.test.ts:7` (`makeTab(overrides: Partial<TabView> = {}): TabView`) with its `EDITOR` payload constant at `:16` | The new test builds complete `TabView` values the same way instead of casting a partial object. |
| Existing tab-strip regression coverage | `web/src/TabStrip.test.tsx:57` (label), `:63` (title over label), `:186` (editor name over a differing, shorter title) | These tests prove the replacement preserves the three fallbacks and the rename prefill. |

## Proposed changes

- Add `web/src/shared/tab/tab-name.ts` exporting `tabFullName` with the contract above. Its only import is the `TabView` type from `@shared/protocol`; it imports no React, no server-side `Tab` type, and nothing from a feature.
- Add `web/src/shared/tab/tab-name.test.ts`.
- In `web/src/TabItem.tsx`, add the value import from `./shared/tab/tab-name`. Use the web-relative path, not `@shared/tab/tab-name`: the `@shared` alias points at the server's `src/`, where no such module exists. Replace only the expression on line 47 with a call to `tabFullName(tab)` and keep the local `const fullName`. Do not change `displayName`, `startEdit`, `commit`, `cancel`, or any JSX.

## Tests

In `web/src/shared/tab/tab-name.test.ts`, build a local `tab(overrides: Partial<TabView>): TabView` fixture from a complete base object and a complete `EditorView` payload, modeled on `web/src/shared/tab/view-guards.test.ts:7` and its `EDITOR` constant at `:16`. Use one `it` per case; do not cast a whole partial view with `as unknown as TabView`.

- A tab with an editor returns `tab.editor.name`, even when `title` and `label` differ. `web/src/TabStrip.test.tsx:186` already exercises this precedence with a shorter title.
- A tab without an editor returns `tab.title` when it has one, even when `label` differs.
- A tab with neither editor nor title returns `tab.label`.
- A tab with an editor whose `name` is `''` returns `''`, not the title. This pins the nullish fallback against a later "helpful" change to truthiness.
- A tab with no editor and `title: ''` returns `''`, not the label. This pins the second fallback for the same reason and is the case that distinguishes `??` from `||` when the title slot is empty.

No new `TabItem` test is needed. The existing tab-strip tests cover all three fallbacks and the rename draft: `web/src/TabStrip.test.tsx:57` renders the label, `:63` prefers the title, and `:186` prefers the editor name over a differing title and asserts the untruncated full name in the rename field. If the replacement returns anything else, those tests fail.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Manual check in the running app: open an editor tab and confirm the tab strip shows its file name, then double-click the active editor tab label and confirm the rename field is pre-filled with the full, untruncated file name. Rename a non-editor tab (for example an image tab) to a new name and confirm the strip shows it; rename it to its own internal label and confirm the title clears and the label shows. The visible behavior must match the current build exactly.

## Out of scope

- No change to tab-name truncation limits, rename validation, or `truncateTabLabel`.
- No new tab-naming rule and no change to what the server sends as `editor.name`, `title`, or `label`.
- No change to `displayLabel`, `tabName`, or any other title-or-label naming helper; no attempt to unify tab names across the strip, tab navigator, and sessions list.
- No walk logic, no quit logic, and no dialog change.
- No other consumer is migrated to the helper in this subplan.
