# Model search 11: The New harness dialog's Model field uses the search input

**Complexity: 6/10** — ~45 added lines, 1 file edited, 16 requirements, 17 test scenarios (p=5.77)

Run order: 11 of 11 in the model search series. Source plan: `product/plans/complete/roles-model-search-input.md`. Depends on `product/plans/ready/roles-model-search-input-4-search-input.md` (`ModelSearchInput`), `product/plans/ready/roles-model-search-input-6-return-and-escape.md` (its Return, Escape, and `onListChange`), `product/plans/ready/roles-model-search-input-9-launch-view-role-entries.md` (`HarnessLaunchView.roleEntries`), and `product/plans/ready/roles-model-search-input-10-launch-dialog-key-yield.md` (the optional `yieldsKey` argument of `useLaunchDialog`). Subplans 1 to 5 come in through subplans 4 and 6. It must land after all four: the input, its `onListChange`, the view's `roleEntries`, and `yieldsKey` don't exist until they do.

The **New harness** dialog (bare `harness`) chooses its model from a native `<select>` today. This step swaps in the same search input the roles picker got in subplans 7 and 8, so matching, Tab completion, the dropdown, clicking, and Escape behave the same in both places. A blank field still means the harness's default model, and a blank field's dropdown lists the models the existing roles use most, ranked from the `roleEntries` the server now delivers.

## Goal

Replace the Model select in `web/src/harness/HarnessLaunchDialog.tsx` with `ModelSearchInput`, apply the dialog's blank-or-exact-id rule to **Create** and Return, move the "clear an unknown model" check to harness changes and the remembered copy, and update the harness spec, the user docs, and the dialog tests.

## Design decisions

All of these come from the source plan unless marked otherwise.

- **The same input (user decision).** The Model select becomes `ModelSearchInput` inside the existing `Model` label, between Auto-resume and Effort. Its `ids` are the `models` value the dialog already computes (`view.models[fields.name] ?? []`, `web/src/harness/HarnessLaunchDialog.tsx:46`), its `harness` is `fields.name`, and its `roleEntries` are `view.roleEntries`. It passes `onListChange` so the dialog can feed `yieldsKey` (below), and no `onSubmit`.
- **Blank means default, otherwise an exact id (user decision).** A blank model input (empty or only whitespace) means the harness's default model, so no `--model` flag is added. Non-blank text that, trimmed, is exactly (case-sensitive) an enabled id of the chosen harness adds `--model <id>`. Any other non-blank text disables **Create** and Return doesn't submit, mirroring the roles picker's Add rule. "Exact id" is an inline `includes` check on the trimmed text, with no helper.
- **One condition drives Create and Return.** The dialog computes "the model is blank or an exact id" once per render. It sets the Create button's `disabled` from it, and passes it as `useLaunchDialog`'s existing `canSubmit` argument, which is the literal `true` today (`web/src/harness/HarnessLaunchDialog.tsx:66`), so the dialog's Return-to-Create path honors the same rule.
- **The placeholder is `(default)` (user decision).** It's the label the select's default option carries today. The visible `Model` label stays.
- **The accessible name stays `Model` (decision for this subplan).** The input sits inside the `<label>`, and while the dropdown is open the label's text content would also hold the rows. Pass `aria-label="Model"` to `ModelSearchInput`, so the input's accessible name is `Model` whether or not the dropdown is open, and `getByLabelText('Model')` keeps finding it.
- **Disabled when the harness has no models (user decision, keeping precedent).** As today, the input is disabled when the chosen harness has no enabled models. It stays blank, shows `(default)`, and the launch uses the default model.
- **Return and Escape follow the shared rules.** `useDialogKeyboard` reads keys in the capture phase, before the input. The dialog passes `yieldsKey` (subplan 10) as "the model dropdown is open, and the key is Escape, or the key is Enter with a row highlighted".
  - With the dropdown open, Escape in the model input closes only the dropdown, and Return accepts the highlighted candidate when one is highlighted. Neither reaches the dialog.
  - Return with no candidate highlighted reaches the dialog's existing handling, Create when allowed, whether the dropdown is open or closed. So Return on a focused blank Model field, with the most-used list open and nothing highlighted, launches with the default model.
  - Escape with the dropdown closed reaches the dialog and cancels.
  - The dialog keeps the latest `onListChange({ open, highlighted })` report in a ref, and `yieldsKey` reads that ref, since the capture listener runs before any render a key could cause.
- **Typing never clears the text (user decision).** The `update` callback stops clearing `model` on every field update — today's `if (!(view.models[next.name] ?? []).includes(next.model)) next.model = ''` at `web/src/harness/HarnessLaunchDialog.tsx:55` — so the text can't be cleared while it's being typed. The check moves to two places:
  - **A harness change.** When the patch changes `name`, the model text is kept only when it is blank or, trimmed, an exact enabled id of the new harness. Any other text is cleared. Auto-approve and auto-resume keep their current harness-change rules.
  - **The remembered copy.** The module-level `remembered` copy written on every update stores the model text only when it is blank or, trimmed, an exact enabled id of that copy's harness, and `''` otherwise. So a remembered dialog never reopens with **Create** disabled by the model field.
- **Restoring checks the current catalog (decision for this subplan).** The source plan's guarantee is that a remembered dialog never reopens with **Create** disabled by the model field. The catalog can change between two opens, so in the `useState` initializer that reads `remembered ?? initialFields(view)` (`web/src/harness/HarnessLaunchDialog.tsx:43`), apply the same blank-or-exact-id rule against the `view` it opens with when the fields come from `remembered`.
- **A republish keeps the text (user decision).** A new view while the dialog is open never changes the typed text. The candidates, the most-used list, and Create's enabled state are recomputed from it. The catalog half of the view is fresh on every snapshot, so an id disabled while the dialog is open turns Create off. The `roleEntries` half was read when the dialog opened (subplan 9).
- **The launch sees a trimmed model.** The dialog hands `useHarnessLaunchActions` its fields with `model` trimmed, so whitespace-only text launches with the default model and an exact id with stray spaces passes the trimmed id. `buildHarnessLaunchCommand` in `web/src/harness/harness-launch-command.ts` is unchanged: its `if (fields.model) parts.push('--model', fields.model)` (`web/src/harness/harness-launch-command.ts:36`) adds the flag only for a non-empty `fields.model`.
- **Look (user decision).** The input keeps the dialog's existing `.harness-launch-form input[type="text"]` style (`web/src/theme.css:691`, disabled form at `:695`; subplan 4 renders `type="text"`). The dropdown uses the same roles-native look as in the roles tab (subplan 2). The dialog's `.modal` (`web/src/theme.css:661`) has no `overflow` rule, so the list measures against the viewport and overlays the Effort field and buttons when it opens below.

## What already exists (reuse, don't rebuild)

| Need | Existing code | Notes |
| --- | --- | --- |
| The dialog being changed | `HarnessLaunchDialog` in `web/src/harness/HarnessLaunchDialog.tsx` | 131 lines; `update` clears an unknown model on every update today; `remembered` is module-level |
| The shared input | `ModelSearchInput` in `web/src/shared/model-search/ModelSearchInput.tsx` | Subplans 4 to 6; the dialog imports the shared file directly, not through `web/src/plugins/api.ts` |
| Role entries | `HarnessLaunchView.roleEntries` in `src/protocol/tab.ts` | Subplan 9 |
| Key yield | `useLaunchDialog`'s `yieldsKey` in `web/src/shared/use-launch-dialog.ts` | Subplan 10 |
| Launch actions | `useHarnessLaunchActions` in `web/src/harness/useHarnessLaunchActions.ts`, `buildHarnessLaunchCommand` in `web/src/harness/harness-launch-command.ts` | Unchanged |
| Existing tests | `web/src/harness/HarnessLaunchDialog.test.tsx` | The empty-catalog case (`:161`) and `--model sonnet` case (`:174`) find the model select by position: `querySelectorAll('select')[1]` |

## Proposed changes

- `web/src/harness/HarnessLaunchDialog.tsx`:
  - Replace the Model select with `ModelSearchInput` as above.
  - Change `update` so it validates the model only on a harness change, and writes the sanitized remembered copy.
  - Validate the model of a remembered copy against the current view when the initial fields are built.
  - Compute the blank-or-exact-id condition. Use it for Create's `disabled` and as `canSubmit`.
  - Keep the list report in a ref and pass `yieldsKey` to `useLaunchDialog`.
  - Pass `useHarnessLaunchActions` the fields with `model` trimmed.
  - The file is 131 lines. If the additions push it toward the 200-line limit, extract the model-validity and remembered-copy logic into a small pure module beside it in `web/src/harness/`, rather than compacting the component.
- `product/specs/harness.md`, "New harness launch dialog": rewrite the **Model** sentences ("and a **Model** dropdown," at `:67`, and "The **Model** dropdown lists the selected harness's known models and is disabled when that harness has no model catalog." at `:78`) to describe the search input. Cover typing to filter the harness's enabled models, Tab, the dropdown and clicking, a blank field meaning the default model and listing the models the roles in effect use most (read when the dialog opens), Create being disabled for non-blank text that isn't an exact enabled id, Return and Escape with the dropdown open, and the field still being disabled when the harness has no enabled models.
- `documentation/user-documentation/advanced-agents/harness.md`, the New harness dialog paragraph at `:105`: "**Model** and **Effort** dropdowns" becomes a **Model** search field and an **Effort** dropdown, with one sentence saying you type to filter, Tab completes, and an empty field uses the default model and lists the models your roles use most. Don't regenerate the `harness-launch-dialog.png` screenshot: its alt text still holds, and the field keeps its place and label.

## Tests

`web/src/harness/HarnessLaunchDialog.test.tsx`. Give the module-level `view` fixture role entries where a case needs them; subplan 9 added `roleEntries: []`. Add the cases in place: `eslint.config.mjs:116` turns `max-lines` off for `*.test.tsx`, so this file growing past 200 lines is fine and splitting it isn't needed.

- Update the model-select cases to use the input:
  - "disables the Model dropdown for a harness with an empty catalog (codex)" checks the input's `disabled`.
  - The `--model sonnet` case types `sonnet` into the input.
  - No case may reach the model field as `querySelectorAll('select')[1]` any longer: after the change that index is the Effort select. Find the input by its `Model` name.
- Add:
  - Blank text builds no `--model`, and whitespace-only text builds no `--model`.
  - An exact id with surrounding spaces builds `--model <id>` (the trimmed id).
  - Partial text disables Create, and Return doesn't submit.
  - Escape with the dropdown open doesn't cancel, and Return with a highlighted row doesn't create but fills the id.
  - Return on a focused blank Model field (most-used list open, nothing highlighted) creates with no `--model`.
  - A harness change keeps an id the new harness has, and clears anything else.
  - Reopening restores only a valid remembered id; a remembered id the reopened view's catalog no longer lists is cleared instead, so Create isn't disabled on open.
  - A rerender with a view that drops the typed id from `models` keeps the text but disables Create.
  - The most-used list comes from `roleEntries`.
  - The input's accessible name is `Model` while the dropdown is open.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, New harness dialog: type bare `harness`.
  1. Focus Model and confirm the most-used list with no row highlighted. Hover a row and confirm it highlights.
  2. Type part of an id, then press Return to accept the highlighted first match.
  3. Press Return again and confirm the harness launches with `--model <id>` recorded in the transcript.
  4. Reopen, type partial text, and confirm **Create** is disabled.
  5. Clear the text, press Return, and confirm a launch with no `--model`.

## Out of scope

- The harness and effort selects in the dialog.
- Any change to `buildHarnessLaunchCommand` or `useHarnessLaunchActions`.
- Regenerating the `harness-launch-dialog.png` screenshot.
- Command-line completion of `harness … --model` (`product/specs/tab-completion.md`), which is unchanged.
