# Disambiguate the builtin question row from the native question ask row

Issue: The Commands tab keys each row by its display label and uses that label in the checkbox names, but the builtin `question` row's label is its first fixed form `question ask`, which is also the native `question ask` row's label, so two sibling rows share one React key and one accessible name.

Complexity rating: 3/10

## Goal

Give the builtin `question` row and the native `question ask` row distinct display labels, React keys, and accessible checkbox names. The builtin row shows `question`; the native row keeps `question ask`. Both Enabled toggles are addressable, a publication repaints only the intended row, and the existing `ask`/`ask reset`, `tell`/`tell reset`, and `search`/`search transcript` form rows keep their labels and shared-setting behavior.

## Approach

In `src/plugins/commands/payload.ts`, change `labelFor` to consider the full row list. Keep the existing rule that a row whose `forms` contains its canonical `name` is labeled by that name. Add one fallback: when the row's first form equals another row's canonical `name`, label the row by its own canonical `name` instead. This gives the builtin `question` row the label `question` because its first form `question ask` is the native row's name, while the native `question ask` row keeps `question ask` because its forms contain its name. Rows with a unique first form (`ask reset`, `tell reset`, `search transcript`) keep that form.

In `web/src/plugins/commands/CommandsTab.tsx`, key each row by `${row.name}:${row.label}` rather than `label` alone, so a future label collision cannot repeat a key. `CommandRow` keeps deriving both accessible names from the label, which is now unique for the two question rows.

## Implementation steps

1. Change `labelFor` in `src/plugins/commands/payload.ts` to accept the full row list and apply the name fallback for a first-form collision; update `toRow`'s call.
2. Change the row key in `web/src/plugins/commands/CommandsTab.tsx` to `${row.name}:${row.label}`.
3. Add `src/plugins/commands/payload.test.ts` with a fixture that includes the builtin `question` row, the native `question ask` and `question approve` rows, and the existing ask/tell/search form rows; assert the mapped labels.
4. Add a `web/src/plugins/commands/CommandsTab.test.tsx` case that renders the builtin `question` row beside the native `question ask` row, asserts both Enabled toggles and the native Agent access toggles are addressable, and asserts a publication repaints only the builtin row.
5. Update `product/specs/commands-tab.md`, `help/commands.md`, and `documentation/user-documentation/tab-types/commands.md` to describe the disambiguated row label.
6. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/plugins/commands/payload.test.ts`: the builtin `question` row maps to label `question`; the native `question ask` row maps to label `question ask`; the native `question approve` row keeps `question approve`; `ask`/`ask reset`, `tell`/`tell reset`, and `search transcript` labels are unchanged.
- `web/src/plugins/commands/CommandsTab.test.tsx`: `Enabled: question` and `Enabled: question ask` are distinct controls; `Agent access: question ask` exists while the builtin row has no Agent access toggle; clicking `Enabled: question` sends `set` for name `question`; publishing a payload with only the builtin row disabled unchecks `Enabled: question` and leaves `Enabled: question ask` checked.
- Existing commands server and client tests continue to pass, including the ask/tell/search form-row rendering and repaint cases.

## Specs and docs

- `product/specs/commands-tab.md`: add that a row is labeled by its canonical name when its first fixed form names another row, so the builtin `question` row reads `question` and the native `question ask` row reads `question ask`.
- `help/commands.md`: add the same label rule to the `### commands` section.
- `documentation/user-documentation/tab-types/commands.md`: add the same label rule to the table description.

## Out of scope

- Command grammar precedence between canonical names and fixed forms; that is a separate backlog entry.
- Broader payload-mapping coverage beyond the question-row label case.
- Any change to settings persistence, dispatch, completion, ACP grants, row order, or the shared canonical setting behind the ask/tell/search form rows.
- Any change to the native `question ask` or `question approve` labels, or to the builtin `question` command's forms.
