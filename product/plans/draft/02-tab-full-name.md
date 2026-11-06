# Add a shared tab full-name helper

**Complexity: 1/10** — one pure three-line helper, one call-site replacement, and a three-case unit test. No state, no effect, no new dependency.

## Goal

Add `tabFullName(tab: TabView): string` to a new `web/src/shared/tab/tab-name.ts`. It returns the name the tab strip treats as the tab's full name: the editor's file name when the tab has one, otherwise the tab's title, otherwise its label. `TabItem` uses it in place of its inline expression. The quit walk uses it in subplan `06` for its dialog title.

The helper moves to `shared/` because the walk is its second consumer, not in anticipation of one, per `ai/guidelines/react-code-organization.md` §2. It stays free of feature-specific branches.

## Dependencies and ordering

This subplan depends on nothing earlier. It is ordered after `01-move-unsaved-work-modules` for a clean sequence, but it does not touch that directory. Subplan `06-quit-walk-guard` depends on it, and subplan `03-save-walk-pure-module` does not: `walkTitle` takes a name string, so the tab-to-name step stays at the caller.

## Design decisions

- The helper has the exact nullish-coalescing order the tab strip uses today at `web/src/TabItem.tsx:47`: `tab.editor?.name`, then `tab.title`, then `tab.label`.
- The fallback is nullish, not truthiness. An empty editor name is returned as an empty string rather than falling through to the title; an empty title is returned rather than falling through to the label. This preserves the current expression exactly. Do not trim, normalize, or replace empty strings.
- The helper takes a `TabView` and returns a `string`. It does not know about dirty state, docking, visibility, or the walk.
- `TabItem` uses the helper for all three places its local `fullName` feeds: the truncated display name, the rename draft, and the rename commit path. The value is computed once per render, as today.
- No other component or module is changed. `truncateTabLabel` keeps its own job in `web/src/tab-label.ts`; the helper does not truncate.
- The new shared module imports only the `TabView` type from `@shared/protocol`. It is a pure module in the shared layer, so it may not import a feature or the app shell.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Inline full-name expression | `web/src/TabItem.tsx:47` (`const fullName = tab.editor?.name ?? tab.title ?? tab.label;`) | Replaced by a call to the new helper. The expression is the contract being preserved. |
| Tab display truncation | `web/src/tab-label.ts` (`truncateTabLabel`) | Unchanged. `TabItem` still calls it with the helper's result. |
| Tab wire shape | `src/protocol.ts` re-exported through `@shared/protocol` (`TabView` with `editor`, `title`, `label`) | The helper imports the type; no new wire shape. |
| Shared tab modules and their test style | `web/src/shared/tab/handles.ts`, `web/src/shared/tab/visible-tabs.ts`, `web/src/shared/tab/handles.test.ts` | The new module and test follow the same flat, colocated pattern. |

## Proposed changes

- Add `web/src/shared/tab/tab-name.ts` exporting `tabFullName`.
- Add `web/src/shared/tab/tab-name.test.ts`.
- In `web/src/TabItem.tsx`, import `tabFullName` from `./shared/tab/tab-name` and replace the inline `fullName` expression with `tabFullName(tab)`. Leave `displayName`, `startEdit`, and the rename commit using that local value.

## Tests

In `web/src/shared/tab/tab-name.test.ts`, with table-style cases using minimal `TabView` casts the way `web/src/shared/tab/handles.test.ts` and `web/src/dirtyTabs.test.ts` build partial views:

- A tab with an editor returns `tab.editor.name`, even when `title` and `label` differ.
- A tab without an editor returns `tab.title` when it has one, even when `label` differs.
- A tab with neither editor nor title returns `tab.label`.
- A tab with an editor whose `name` is an empty string returns the empty string, not the title. This pins the nullish fallback against a later "helpful" change to truthiness.

No new `TabItem` test is needed; the existing tab-strip tests still render the same displayed names and rename behavior.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

Manual check in the running app: open an editor tab and confirm the tab strip shows its file name; rename a non-editor tab and confirm the tab strip still prefers its title, then its label when no title is set. The visible behavior must match the current build exactly.

## Out of scope

- No change to tab-name truncation limits, rename validation, or `truncateTabLabel`.
- No new tab-naming rule and no change to what the server sends as `editor.name`, `title`, or `label`.
- No walk logic, no quit logic, and no dialog change.
- No other consumer is migrated to the helper in this subplan.
