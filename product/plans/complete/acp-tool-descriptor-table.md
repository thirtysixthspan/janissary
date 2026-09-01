# Give the ACP tool surface one descriptor table

Complexity: 4/10

## Goal

Make the browser, question, and database tools a single ordered table that `AcpManager.run` walks, instead of three hand-kept parallel lists — a concatenated primer string, a chain of `if` arms in the command runner, and a differently-ordered `??` chain in the extractor. Adding a fourth tool should become one entry rather than three edits that can disagree.

## Approach

Add `src/acp/tool-table.ts` exporting an `AcpTool` type and `createAcpToolTable(managers)`, which returns an ordered array whose entries each carry `{ primer, match, run, extract }`. The module is a distinct concern from the existing `src/acp/tools.ts`, which classifies tool-permission requests and has nothing to do with the run loop.

`AcpManager.run` then derives all three loop options by walking that one array: `primer` by joining the fragments, `runCommand` by the first entry whose `match` accepts the command string, `extractCommand` by the first entry whose `extract` returns something for the agent's reply text.

Two details the table must not flatten:

- An entry carries **two different predicates**. `match` reads the command string the agent emitted; `extract` reads the agent's whole reply. They are not the same test and cannot be collapsed into one.
- The database entry is the **fall-through** today — `runCommand` reaches `database.runInTab` when neither the browser nor the question pattern matched. Modelling that as a `match` that accepts everything, placed last, preserves the behavior exactly.

Two orderings change as a side effect, neither observably:

- **The extractor's order.** Today it is browser → database → question, while the runner is browser → question → database. Unifying them puts both on browser → question → database. The three extractors match disjoint line prefixes — `browser open|list|use|goto|eval|shot|content|close|window`, `question ask|approve`, and `db sqlite create|delete|query|list` — so no reply can be claimed by two entries and none resolves differently.
- **The primer's fragment order.** Today the string is concatenated database → browser → question; joining the table puts it in table order, browser → question → database. The fragments are independent instruction blocks with no cross-references, so the agent is told the same three things.

Per `ai/guidelines/plugins.md` section 2, the module states its resolution strategy — first match over an ordered array — in its own comment rather than leaving it to array position.

## Implementation steps

1. Write `src/acp/tool-table.ts`: the `AcpTool` type, the resolution-strategy comment, and `createAcpToolTable(managers)` returning the browser, question, and database entries in that order.
2. Add derivation helpers in the same module — `toolPrimer(tools)`, `toolRunner(tools, label)`, `toolExtractor(tools)` — so `manager.ts` reads the table rather than reimplementing the walk.
3. Rewire `AcpManager.run` to build the table once and pass the three derived options to `runAcpToolLoop`, keeping the trailing Markdown instruction appended to the joined primer exactly as it reads today.
4. Drop the now-unused `extractBrowserCommand` / `extractQuestionCommand` / `runQuestionCommand` / `BROWSER_PRIMER` / `QUESTION_PRIMER` imports from `manager.ts`.

## Tests

- `src/acp/manager.test.ts` covers the browser/question/database dispatch and the primer's contents; it must keep passing.
- `src/acp/loop.test.ts` covers the loop's use of the extractor; unchanged.
- Add `src/acp/tool-table.test.ts` covering: every entry contributes its fragment to the joined primer in table order; a `browser …` command routes to the browser entry and a `question …` command to the question entry; an unmatched command falls through to the database entry; the extractor returns the first entry that claims the reply and `null` when none does.
- Run `./scripts/run.mjs check-diff` after each step.

## Specs and documentation

No user-visible behavior changes — the same three tools, primed and dispatched the same way. No spec, `help.md`, or `documentation/user-documentation/` updates expected.

## Out of scope

- Adding a fourth tool.
- Changing `src/acp/tools.ts` (tool-permission classification).
- Making the table plugin-loadable or externally registrable; it stays a static in-repo list built from `Managers`.
- Changing what any individual tool's primer, matcher, runner, or extractor does.
