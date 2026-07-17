# Effort dropdown for new harness launch dialog

**Complexity: 2/10** — one component, swap a text input for a select with a fixed option list;
no server or protocol changes (`--effort` is passed through verbatim, unvalidated).

## Goal

The **New harness** launch dialog's Effort field is currently a free-text input. Replace it with a
dropdown listing the five supported effort levels: `low`, `medium`, `high`, `xhigh`, `max`, plus a
`(default)` option for omitting `--effort` entirely — mirroring the existing Model dropdown's
`(default)` + fixed-catalog pattern.

## Approach

`web/src/HarnessLaunchDialog.tsx:94-96` currently renders:
```tsx
<label>Effort
  <input type="text" value={fields.effort} placeholder="(optional)" onChange={(e) => update({ effort: e.target.value })} />
</label>
```
Change this to a `<select>` following the exact shape of the Model dropdown two fields above it
(`:88-93`): a `(default)` empty-value option first, then one `<option>` per effort level. No new
state shape is needed — `fields.effort: string` already holds `''` for "no flag" and any non-empty
string is passed through to `buildHarnessLaunchCommand` unchanged (`harness-launch-command.ts:28-29`),
so `''` from the new select's `(default)` option behaves identically to the old input's empty string.

The five levels are a fixed, small list local to this one dialog (no other file needs them), so a
local constant array is the right scope — no shared/exported catalog is warranted.

## Implementation steps

1. In `web/src/HarnessLaunchDialog.tsx`, add a module-level constant near the top (alongside
   `initialFields`):
   ```ts
   const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
   ```
2. Replace the Effort `<input>` (`:94-96`) with:
   ```tsx
   <label>Effort
     <select value={fields.effort} onChange={(e) => update({ effort: e.target.value })}>
       <option value="">(default)</option>
       {EFFORT_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
     </select>
   </label>
   ```
3. Run `./scripts/run.mjs check-diff`.

## Tests

Add to `web/src/HarnessLaunchDialog.test.tsx`:

- `Effort dropdown lists the five supported levels plus a default option` — render the dialog,
  locate the Effort `<select>` (third `<select>` in document order: Harness, Model, Effort — use
  `getByLabelText(/Effort/)` for clarity), assert its `<option>` values equal
  `['', 'low', 'medium', 'high', 'xhigh', 'max']`.
- `selecting an effort level includes --effort in the built command` — render, change the Effort
  select to `'high'`, click Create, assert the sent command text contains `--effort high` (mirror
  the existing `'Create submits the composed command and closes the dialog'` test's pattern at
  `:57-65`).

## Spec updates

`product/specs/harness.md:23-44` ("New harness launch dialog") currently says the dialog offers
"a **Model** dropdown, and an **Effort** field." Update the wording to describe Effort as a
dropdown too, and note the specific levels it offers (`low`, `medium`, `high`, `xhigh`, `max`,
plus the default/omitted option), matching how the Model dropdown is already described in the
surrounding paragraph.

## Out of scope

- Server-side effort validation — `--effort` remains an unvalidated pass-through
  (`src/harness/index.ts:78`); the dropdown only constrains what the *dialog* can submit, exactly
  as the existing Model dropdown does.
- The other backlog issue (permission prompt formatting) — a separate fix.

## Verification

- `./scripts/run.mjs check-diff` passes.
- Manual: not possible in this environment (no browser); covered by the automated dropdown-options
  and submitted-command tests instead.
