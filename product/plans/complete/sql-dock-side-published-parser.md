# Read the sql plugin's dock side through the one published parser

## Complexity

5/10 — one module's argument grammar rewired to the published parser, one dead parser deleted, and unit cases added. No new architecture; the risk is the two grammars disagreeing about case, which is the bug being fixed.

## Goal

`src/plugins/dock-argument.ts` is the published dock-side parser, re-exported to plugins at `src/plugins/api.ts:406` and used by every other dockable list plugin, but `src/plugins/sql/shared-intents.ts` carries a second private parser, `parseOpenCommand`, that sql actually calls — and the two disagree about case. `sql LEFT`, `sql Right` and `sql shop LEFT` fall through as database names, pass `isValidDatabaseName`, and ask the host to open a database the registry has never heard of, so the user is told a name was invalid when what they typed was a side in the wrong case. Meanwhile `src/plugins/sql/activate.ts:15-17` claims the side is read "through the one published parser so the two cannot drift", which nothing enforces.

## Approach

Rewrite `runCommand` in `src/plugins/sql/activate.ts` to split the argument itself — the trailing token goes to the published `parseDockArgument`, which lowercases and trims — and delete `parseOpenCommand` and its `OpenCommand` type, whose `'usage'` branch is unreachable as written (`dock` is `undefined` only when `words` is non-empty, which makes `name` non-empty too). Keep the splitting itself as a small exported function beside the plugin's other command-side helpers so the argument grammar stays unit-testable, with `isValidDatabaseName` and the `Invalid database name` refusal exactly where they are. The now-dead `USAGE` constant goes with the branch that used it. Add the argument-splitting cases to `src/plugins/sql/shared.test.ts`, which already imports the sibling guards out of `shared-intents.js`.

## Implementation

1. In `src/plugins/sql/shared-intents.ts`, delete `parseOpenCommand` and `OpenCommand`, and add `parseSqlArgument(argument)` returning `{ name, dock }`: split the trimmed argument on whitespace, hand the trailing token to the published `parseDockArgument` (imported from `../api.js`, as `conversations/activate.ts` does), and take the name as the remaining words. `dock` is the published parser's answer verbatim — `'left'`, `'right'`, `null` for a bare argument, `undefined` when the trailing token is not a side.
2. In `src/plugins/sql/activate.ts`, replace the `parseOpenCommand` import with `parseSqlArgument` — the splitter calls the published parser through `../api.js` itself, so `activate.ts` needs no direct import of it — rewrite `runCommand` to destructure `{ name, dock }` from it and drop the unreachable usage branch, and remove `USAGE` from the `./tabs.js` import.
3. In `src/plugins/sql/tabs.ts`, delete the now-unused `USAGE` constant.
4. Add the argument-splitting cases to `src/plugins/sql/shared.test.ts`.
5. Run `./scripts/run.mjs check-diff` after the splitter, after the `runCommand` rewrite, and after the tests.

## Tests

- In `src/plugins/sql/shared.test.ts`, a describe block for `parseSqlArgument`: a bare argument is a name of `''` with a `null` dock; `left`, `right`, `LEFT`, `Right` and ` left ` are sides with a name of `''`; `shop` is a name with an `undefined` dock; `shop left` and `shop LEFT` dock the `shop` tab; a two-word non-side argument stays one name; `shop left right` splits to the name `shop left` and the side `right`, which the name guard then refuses.
- `src/plugins/sql/activate.test.ts` must keep passing unchanged — its command cases pin the end-to-end answers (`shop left` docking, the bare argument undocking, the invalid-name and unknown-name refusals). It gains no `LEFT`-case here only because the published parser's own suite proves the lowercase rule; the sql-side proof is that the trailing token reaches it.

## Out of scope

- `src/plugins/dock-argument.ts` itself and its suite — the published rule is unchanged.
- The other dockable plugins' call sites; they already read the published parser.
- Changing what a database named `left` or `right` means for reachability; `sql left` docking the current tab stays the documented trade.

## Verification

- `./scripts/run.mjs check-diff` passes after each step.
- A repository-wide search finds no remaining `parseOpenCommand` or `OpenCommand` in `src/plugins/sql/`.
- `activate.test.ts` passes unchanged, so every command answer the plugin gave before is still given — except the wrong-case sides, which now resolve through the published rule.

## Documentation and specification impact

None. The `sql` command's documented grammar (`sql [<database>] [left|right]`) is unchanged; only the wrong-case spellings now behave the way the grammar says they should. No spec, `help.md`, or user documentation update is needed.
