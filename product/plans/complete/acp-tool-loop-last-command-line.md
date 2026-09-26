# Run the command on the ACP reply's last command line, whichever tool owns it

**Complexity: 4/10**: one new pure helper module, three extractors reduced to predicates plus thin wrappers, the tool table switched from per-tool extractors to per-tool predicates, and the loop's display filter pointed at the same cleanup. No wire change and no new architecture.

The ACP tool loop pulls a command out of an agent reply through `toolExtractor` in `src/acp/tool-table.ts`, which walks the tool table (browser, question, database) and returns the first non-null `tool.extract(text)`. Each extractor scans the whole reply bottom-up for its own grammar only, so tool order beats position: a reply that mentions `browser goto` early and ends with the `db sqlite query` the agent meant runs the browser command, and the database command never runs. `filterCommandFromDisplay` in `src/acp/loop.ts` then removes the first matching line from the top, not the one that ran.

The same line cleanup, `replace(/^[\s`$>]+/, '').replace(/`+\s*$/, '').trim()`, is copied into `extractBrowserCommand` (`src/browser/command.ts`), `extractQuestionCommand` (`src/question-command.ts`), `extractDatabaseCommand` (`src/database/primer.ts`), and `filterCommandFromDisplay`. The database extractor reports absence as `undefined`, the other two as `null`.

## Goal

The command that runs is the one on the reply's last command-shaped line, whichever tool owns it. The display filter removes that same line, searching from the bottom. The cleanup exists once, and every extractor reports absence as `null`.

## Approach

1. **`src/acp/command-line.ts`** (new, pure, imports nothing) exports:
   - `cleanCommandLine(line)`: strips a leading run of whitespace, backticks, `$`, and `>`, strips trailing backticks and whitespace, and trims.
   - `findLastCommandLine(text, test)`: walks the reply's lines bottom-up and returns the first cleaned line for which `test(line)` is true, or `null`.
2. Each tool module exports a pure predicate built from its existing regex, and keeps its `extract*` export as a thin wrapper over `findLastCommandLine`:
   - `isBrowserCommandLine` in `src/browser/command.ts`;
   - `isQuestionCommandLine` in `src/question-command.ts`;
   - `isDatabaseCommandLine` in `src/database/primer.ts`; `extractDatabaseCommand` now returns `string | null`.
3. **`src/database/manager.ts`**: `DatabaseManager.extract(text)` becomes `isCommandLine(line)`, delegating to `isDatabaseCommandLine`, imported directly from `./primer.js`. The tool table was its only caller, and a whole-reply extractor on the manager would be a path nothing takes once the table reads predicates.
4. **`src/acp/tool-table.ts`**: `AcpTool.extract` is replaced by `isCommandLine(line)`. `toolExtractor` returns `findLastCommandLine(text, (line) => tools.some((tool) => tool.isCommandLine(line)))`. The resolution comment is updated: extraction is now by position (last command line wins), and table order only decides which tool runs an emitted command.
5. **`src/acp/loop.ts`**: `filterCommandFromDisplay` cleans lines with `cleanCommandLine` and finds the command with `lastIndexOf`.

### Rejected alternatives

- Asking each tool for its last line index and picking the greatest. It keeps three whole-reply scans and still needs a shared cleanup, so it is more code for the same answer.
- Leaving `extractDatabaseCommand` returning `undefined`. The two "none" values are part of the debt, and the only readers that care are two test assertions.

## Implementation steps

1. Add `src/acp/command-line.ts`.
2. Add the three predicates and rewrite the three extractors over the helper; unify the database one on `null`.
3. Replace `DatabaseManager.extract` with `isCommandLine`.
4. Switch `AcpTool` and `toolExtractor` to predicates.
5. Point `filterCommandFromDisplay` at `cleanCommandLine` and `lastIndexOf`.
6. Update the tests below and run `./scripts/run.mjs check-diff`.

## Tests

- `src/acp/command-line.test.ts` (new): `cleanCommandLine` strips a prompt marker, inline backticks, and surrounding whitespace; `findLastCommandLine` returns the bottom-most passing line, returns `null` when nothing passes, and tests the cleaned line rather than the raw one.
- `src/acp/tool-table.test.ts`: the module mocks become predicate stubs (`isBrowserCommandLine`, `isQuestionCommandLine`, and the database manager's `isCommandLine`); existing extractor cases keep their meaning; a new case asserts that a reply with a browser line followed by a trailing db line yields the db line; a new case asserts the reverse order yields the browser line.
- `src/acp/loop.test.ts`: a new case where the same command text appears twice in a reply asserts the display keeps the earlier mention and drops the last line.
- `src/db.test.ts` and `src/database/manager.test.ts`: the "none" assertions move from `undefined` to `null`, and the manager case pins `isCommandLine` instead of `extract`.
- `src/acp/manager.test.ts`: the browser module and database manager mocks gain the predicate names.
- `src/browser/command.test.ts` and `src/question-command.test.ts` stay unchanged and passing.

## Spec updates

- `product/specs/acp.md`: step 2 of the tool loop now says the last command-shaped line wins regardless of which tool owns it, and that table order only decides which tool runs an emitted command.

## Out of scope

- An agent that ends a finished answer by quoting a command still has it run, exactly as today.
- The stale file names in `product/specs/acp.md` (`src/db.ts`, `src/browser-command.ts`, `src/acp-loop.ts`, `src/cli.tsx`) are left for a documentation pass.
