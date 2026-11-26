# Add the import and export verbs to the hosts command grammar
**Complexity: 5/10** — 1 file edited, 12 requirements and 19 scenarios (p=5.61)

## Goal

Teach `parseCatalogCommand` to recognize `hosts import [file]` and `hosts export [file]`, with their own usage lines and quoted-operand grammar, without any I/O. It is the ninth piece of `import-openssh-aliases-into-the-hosts-tab.md`, named by file name so the reference survives that plan's promotion. Subplan 10 executes the parsed verbs; this subplan only extends the pure parse layer.

## Requirements

1. `IMPORT` and `EXPORT` are recognized regardless of case ("Every verb matches regardless of case").
2. Each verb takes zero or one operand ("`hosts import <file>` command to allow for other files", "Button + `hosts export`").
3. A file operand may be wrapped in double quotes, and the text between them, which may contain spaces, is the path ("Quoted paths").
4. Inside double quotes there are no escapes: a backslash or a single quote is kept verbatim and never changes where the quoted operand ends ("Quoted paths").
5. An unquoted operand is one whitespace-free token ("Quoted paths").
6. An unmatched double quote in an import gives `Usage: hosts import [file]` ("Quoted paths").
7. An unmatched double quote in an export gives `Usage: hosts export [file]` ("Quoted paths").
8. Any text after a complete operand gives that verb's usage line ("Quoted paths").
9. The bare usage line becomes `Usage: hosts [list|add|remove|import|export].` ("Extend + own lines").
10. A malformed import gives `Usage: hosts import [file]` ("Extend + own lines").
11. A malformed export gives `Usage: hosts export [file]` ("Extend + own lines").
12. Parsing either verb, well-formed or malformed, performs no path resolution and no file read or write (Assumption 1, preserved behavior 3 below).

## Design decisions

Depends on nothing earlier. `import-openssh-aliases-into-the-hosts-tab-10-command-runtime.md` consumes the variants this subplan produces, so it lands after this one and replaces this subplan's command-layer checkpoint behavior with execution.

- Only `src/plugins/hosts/catalog-commands.ts`, its colocated test, and the hardcoded usage-line expectations in `src/plugins/hosts/activate.test.ts` change here. `CatalogParse` gains two variants, one named `import` and one named `export`, each carrying a single `operand` string that is empty when no file was given, mirroring the plain string `name` of the existing `remove` variant at `src/plugins/hosts/catalog-commands.ts:14`. The parser stays pure and does no I/O (Assumption 1).
- `CatalogOutcome` is not extended. `runCommand` reads `outcome.text` from the remaining `output` variant at `src/plugins/hosts/activate.ts:74`, so adding a `CatalogOutcome` member would break that access without an edit to `activate.ts`. Instead the final unmatched branch of `runCatalogCommand` at `src/plugins/hosts/catalog-commands.ts:94` becomes an explicit check for the `remove` variant, and a valid import or export variant returns a refusal carrying that verb's usage line at this checkpoint. No file is read, written, published, or opened; subplan 10 replaces this branch with the real dispatch.
- The grammar is settled by requirements 50, 51, and 53 of `import-openssh-aliases-into-the-hosts-tab.md` and by the spec's "Every verb matches regardless of case" at `product/specs/hosts-tab.md:65`. The operand is read from the raw text after the verb, not from the whitespace-split word list, because `parseCatalogCommand` splits on whitespace (`src/plugins/hosts/catalog-commands.ts:53`) and that would break a quoted path containing spaces. Use string operations the way `parseAdd` does at `src/plugins/hosts/catalog-commands.ts:32` and `:37`, not a regular expression: `security/detect-unsafe-regex` is an error at `eslint.config.mjs:109`.
- The exact parse contract is: match the verb case-insensitively through the existing lower-casing at `src/plugins/hosts/catalog-commands.ts:55`; trim the tail; an empty tail is the zero-operand variant; a tail starting with `"` is quoted and the next `"` closes it, with the inner text used verbatim, so `""` is malformed and a backslash never escapes the closing quote; non-whitespace after the closing quote, or a `"` anywhere in an unquoted tail, is malformed; an unquoted tail may not contain internal whitespace. Every malformed form returns the refusing verb's own usage line (Requirements 6 to 8, 10 and 11).
- The bare `USAGE` constant is replaced, not supplemented, so every existing unknown-verb refusal uses the new line. The two new usage constants sit beside the existing `ADD_USAGE` and `REMOVE_USAGE` constants at `src/plugins/hosts/catalog-commands.ts:7` and `:8`.
- No new module and no import changes. `src/plugins/hosts/catalog-commands.ts` is 105 lines, under the 200-line `max-lines` limit at `eslint.config.mjs:62`, and its test file is exempt at `eslint.config.mjs:117`, so this subplan leaves the tree green on its own.

## Preserved behavior

1. `hosts list` prints exact two-space JSON. Adding verbs must not change a single byte of that output: no added key, no reordering, no change in indentation. Pinned by `src/plugins/hosts/catalog-commands.test.ts` › `returns exact two-space JSON for a list`.
2. `hosts add` replaces only a case-folded match under the newly typed spelling. The new verbs must not join that replace path: the matched host is still replaced under the newly typed spelling, and neither new verb replaces anything. Pinned by `src/plugins/hosts/catalog-commands.test.ts` › `replaces only a case-folded match under the newly supplied spelling`.
3. Malformed `hosts` requests never touch storage. The malformed import and export forms must leave both the home and project `hosts.json` absent, and a valid new verb must not create either file at this checkpoint. Pinned by `src/plugins/hosts/catalog-commands.test.ts` › `skips storage for malformed requests`.

## Assumptions

1. The `hosts` command parses verbs purely before any I/O: `src/plugins/hosts/catalog-commands.ts:52` `export function parseCatalogCommand(` and `:53` `const words = argument.trim().split(/\s+/u).filter((word) => word.length > 0);`.
2. The existing usage constants are declared together: `src/plugins/hosts/catalog-commands.ts:6` `const USAGE = 'Usage: hosts [list|add|remove].';`.
3. Verbs are matched after lower-casing the first word, so case-insensitivity needs no new helper: `src/plugins/hosts/catalog-commands.ts:55` `const verb = words[0].toLowerCase();`.

## Existing functionality

1. Pure verb parsing before I/O: `src/plugins/hosts/catalog-commands.ts:52` `export function parseCatalogCommand(`.
2. The `CatalogParse` union holds the parsed verb variants: `src/plugins/hosts/catalog-commands.ts:10` `export type CatalogParse =`.
3. The refusal outcome shape that needs no file work: `src/plugins/hosts/catalog-commands.ts:20` `| { kind: 'refusal'; reason: string }` (the `CatalogOutcome` member).
4. The refusal helper used by the parse functions: `src/plugins/hosts/catalog-commands.ts:23` `function refusal(reason: string): CatalogParse {`.
5. The existing usage constants: `src/plugins/hosts/catalog-commands.ts:6` `const USAGE = 'Usage: hosts [list|add|remove].';`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`. This subplan changes three files: `src/plugins/hosts/catalog-commands.ts`, its colocated test, and `src/plugins/hosts/activate.test.ts`. Changing the bare `USAGE` line requires updating the hardcoded old usage string in the `refuses unsupported forms and docking arguments` test in `activate.test.ts`, which asserts the refusal `runCommand` passes through, not any new command behavior. No symbol it imports is new, so the tree compiles at this commit without subplan 10.

1. In `src/plugins/hosts/catalog-commands.ts`, extend `CatalogParse` with the two verb variants and their string `operand`; add the two case-insensitive verbs to `parseCatalogCommand` using the exact parse contract in Design decisions; add the two new usage constants and replace the bare `USAGE` line. Change the final unmatched branch of `runCatalogCommand` (`catalog-commands.ts:94`) into an explicit check for `remove`, and have the two new variants return a refusal with their own usage line at this checkpoint. Leave `list`, `add`, `remove`, `CatalogOutcome`, and `activate.ts` untouched. Build with `$janissary/scripts/run.mjs check-diff`.
2. In `src/plugins/hosts/catalog-commands.test.ts`, add the cases listed under Tests beside the existing ones, leaving every existing case unchanged. Build with `$janissary/scripts/run.mjs check-diff` and confirm the whole server test project passes, including all three preserved-behavior pins.
3. In `src/plugins/hosts/activate.test.ts`, update the three hardcoded old bare usage strings in the `refuses unsupported forms and docking arguments` test (`:211` to `:213`) to `Usage: hosts [list|add|remove|import|export].`, leaving every other case in that file unchanged. `activate.ts` itself stays untouched. Build with `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user interface surface changes. This subplan edits the command parser only; the usage lines it returns are text already shown in the transcript by `runCommand` at `src/plugins/hosts/activate.ts:67` to `:74`, and no client entry point is involved.

## Tests

In `src/plugins/hosts/catalog-commands.test.ts`:

- `IMPORT` and `EXPORT` with zero or one operand parse as the new variants regardless of case (Requirements 1 and 2).
- A quoted operand keeps its spaces and an unquoted operand is a single token (Requirements 3 and 5).
- A backslash and a single quote inside a quoted operand are kept verbatim (Requirement 4).
- An empty quoted operand, a quote inside an unquoted tail, an unmatched quote, and a trailing token after an operand each give that verb's own usage line (Requirements 6 to 8, 10 and 11).
- An unknown verb and `list extra` give the new bare `Usage: hosts [list|add|remove|import|export].` line (Requirement 9).
- A valid import or export reaches `runCatalogCommand` and produces only that verb's usage-line refusal, with no file read or write (Requirements 10 to 12).
- Malformed new forms leave both `hosts.json` paths absent, extending the existing malformed-request case (Requirement 12, preserved behavior 3).
- The `list`, `add`, and `remove` cases pass unchanged (preserved behaviors 1 and 2).

In `src/plugins/hosts/activate.test.ts`:

- The `refuses unsupported forms and docking arguments` test expects the new bare `Usage: hosts [list|add|remove|import|export].` line for `show`, `left`, and `right`, with every other case in the file unchanged (Requirement 9).

## Out of scope

- No execution of either verb beyond the checkpoint refusal, no path resolution, no file access, no remote-tab decision, and no reporting text beyond the usage lines.
- No change to `CatalogOutcome`, to `runCatalogCommand`'s existing list, add, and remove results, to `activate.ts`, to the intent table, or to any client surface.
- No command registry or manifest change.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass with only these three files changed.

Then check against the running app with a scratch home. In the Hosts tab command bar run `show` and confirm the transcript says `Usage: hosts [list|add|remove|import|export].`; run `hosts import "my config" extra` and confirm `Usage: hosts import [file]`; run `hosts EXPORT` and confirm it is recognized as a verb (its usage line appears, not an unknown-verb refusal) and that no `hosts.json` appears in the scratch home. A failure looks like the old bare usage line, a split operand, an unknown-verb refusal for `EXPORT`, or a file created while parsing.
