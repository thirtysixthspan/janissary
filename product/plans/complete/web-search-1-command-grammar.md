# Web search 1: the `web search` command grammar, usage line, and primer text

**Complexity: 6/10** — ~115 added lines, 16 requirements, 26 test scenarios, no existing files edited (p=5.90)

The first slice of the `web search` feature (source plan: `./product/plans/complete/web-search.md`). It adds the pure text layer every later slice reads: the predicate that claims every `web` line, the stricter predicate that recognizes an agent's reply line, the exact usage line and primer text, the flag ranges and defaults as exported constants, and `parseWebSearch`, which turns one line into a parsed request or the usage line. Nothing runs a search, registers a command, or touches ACP here. Later slices import these names: the `web` command (`./product/plans/complete/web-search-10-typed-command.md`), the agent-run refusal (`./product/plans/complete/web-search-9-agent-run-refusal.md`), the remote operation's argument check (`./product/plans/complete/web-search-7-remote-operation.md`), the ACP workspace routes (`./product/plans/ready/web-search-11-workspace-routes.md`), and the ACP tool entry (`./product/plans/ready/web-search-12-acp-tool.md`).

## Dependencies

None. This is the first subplan.

## Design decisions

Carried verbatim from the source plan where they apply.

- **Command (feature text, extended by user decision).** `web search <query> [--results n] [--max-chars n] [--depth basic|advanced] [--provider name]`; `--depth` is the one flag added to the feature text's grammar.
- **Query text (user decision).** The query is everything after `web search` up to the first whitespace-separated token that starts with `--`, trimmed, with each whitespace run collapsed to one space. Quotes and operators such as `site:` are kept as typed and sent to the provider, so `"exact phrase"` works. The flags follow the query in any order; a word after the flags that is not a flag's value is a usage error, so a query cannot itself contain a word starting with `--`.
- **Usage line (user decision).** Every malformed form prints exactly `Usage: web search <query> [--results <1-20>] [--max-chars <200-100000>] [--depth basic|advanced] [--provider <name>]` and sends nothing: bare `web search`, an empty query, an unknown or repeated flag, a flag with no value, a `--results` or `--max-chars` that is not a whole number in range, a `--depth` other than `basic` or `advanced`, and a word after the flags. The `web` command claims every line starting with the word `web`, as `file` claims every `file` line (`src/commands/file.ts`), so bare `web` and any other `web <word>` print the same line.
- **Result count (user decision).** `--results` takes a whole number from 1 to 20 and defaults to 10.
- **Character budget (user decision).** `--max-chars` takes a whole number from 200 to 100000 and defaults to 10000.
- **Search depth (user decision).** A `--depth basic|advanced` flag, default `basic`. A value other than `basic` or `advanced` (matched case-insensitively) is a usage error. The parsed request carries the lowercase value.
- **Provider flag.** `--provider <name>` defaults to `auto`. The parser only requires a value; whether the name is known is decided by the registry (`./product/plans/complete/web-search-5-provider-registry.md`), which matches names case-insensitively and reserves `auto`.
- **Two predicates for two kinds of text.** As `AcpTool` separates `match` from `isCommandLine`: `isWebCommandLine(line)` (`/^web(\s|$)/i`, any line whose first word is `web`), which the `web` command and both `runWorkspace` routes use so a malformed `web` line is still answered with usage; and `isWebSearchReplyLine(line)`, which recognizes an agent's reply line only when it starts with lowercase `web search` followed by whitespace or the end of the line. The reply-line rule is deliberately case-sensitive, unlike the file and browser predicates, because a model's final answer often begins a sentence with "Web search …" and the extractor reads the reply's last recognized line as a command; the primer always shows the lowercase form.
- **Primer (user decision).** The web tool's primer is exactly these lines, joined with newlines, exported as `WEB_SEARCH_PRIMER`:
  - `To search the web, end your reply with one line:`
  - `web search <query> [--results <1-20>] [--max-chars <200-100000>] [--depth basic|advanced] [--provider <name>]`
  - `The result is a Markdown list of up to 10 results by default, each a title linked to its URL with a snippet beneath. For time-sensitive searches, include the year in the query; the search does not infer freshness.`
  - `--depth advanced gives better snippets but costs more; use it only when basic results are not enough.`
  - `Search only when the answer needs current or external information; never put file contents or secrets in a query.`
  - `Example: web search node.js permission model 2026 --results 5`
- **No date in the primer (user decision).** The primer tells the agent to include the year for time-sensitive searches but states no date or year itself. The year in the example query is illustrative only.
- **Freshness (feature text).** Nothing in the grammar infers freshness or rewrites the query with a date.
- **Parse pure (architecture principle 4).** `parseWebSearch` returns a value or `{ error }` and does no I/O.
- **Tokenizing (decision, from `parseFileGlob`).** The line is trimmed and split on `/\s+/`, as `parseFileGlob` does at `src/file-glob/command.ts` (`input.trim().split(/\s+/)`). The first token must be `web` and the second `search`, both case-insensitive. The query is the following tokens up to (not including) the first token that starts with `--`, joined with single spaces; that join is what trims and collapses whitespace, so tabs and runs of spaces inside quotes collapse too. A token starting with a single `-` (`-site:example.com`) is a query word, not a flag.
- **Flag names (decision, from `scanFlag`).** The four flag names match exactly and in lowercase, as `scanFlag` in `src/file-glob/command.ts` does with its `switch`. `--Results`, `--results=5`, and a bare `--` are unknown flags and print usage.
- **Missing flag value (decision, from `scanPath`).** A flag is missing its value when it is the last token or when the next token starts with `--`, as `scanPath` refuses a `--`-prefixed value. This holds for all four flags, so `web search x --provider --results 3` is a usage error rather than a provider named `--results`.
- **Whole numbers (decision).** `--results` and `--max-chars` values go through `positiveInteger` (`src/positive-integer.ts`), which accepts only `/^\d+$/` digits that make a safe integer ≥ 1 (so `1.5`, `abc`, `-3`, `+5`, and `1e3` are refused and `007` is 7), then the range check against the exported constants.
- **Provider value kept as typed (decision).** The parser stores the `--provider` value exactly as typed, case included, because the registry matches case-insensitively and the unknown-provider line quotes the name as typed. The parser does not reject `auto` or any other name.
- **Reply-line predicate shape (decision).** `isWebSearchReplyLine` is `isFileGlobCommandLine`'s rule (`/^file\s+glob(\s|$)/i`) for `web` and `search` without the `i` flag: lowercase `web`, one or more whitespace characters, lowercase `search`, then whitespace or the end of the line. `web  search x` is a reply line; `Web search …`, `WEB SEARCH x`, and `web searching` are not.
- **No host dependencies.** `command.ts` imports only `positiveInteger` at runtime. It loads no `Managers` and touches no tab or channel, because the ACP tool table (loaded on both hosts), the remote operation, and the type-only import from `contract.ts` (`./product/plans/complete/web-search-2-result-rendering.md`) all read it.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this slice uses it |
| --- | --- | --- |
| Flag scanning | `src/file-glob/command.ts` (`scanArguments`, `scanFlag`, `FILE_GLOB_USAGE`, `parseFileGlob`) | Model for the flag loop: a scanner per flag that refuses a repeat or a missing value, and the `{ error }` result shape. |
| Whole-number check | `src/positive-integer.ts` (`positiveInteger`) | `--results` and `--max-chars` go through it before their range check. |
| Line predicates | `src/file-glob/command.ts` (`isFileGlobCommandLine`), `src/file-read/command.ts` | Shape for `isWebCommandLine`. |
| Exported range constants | `FILE_GLOB_MAX_LIMIT` in `src/file-glob/command.ts`, imported by `src/remote/filesystem/glob-paths-operation.ts` | Same pattern for the web-search ranges the remote operation reuses later. |

## Proposed changes

New feature directory `src/web-search/` with one module:

- **`src/web-search/command.ts`** (new)
  - `WEB_SEARCH_USAGE`, the exact usage line above.
  - `WEB_SEARCH_PRIMER`, the exact primer lines above joined with newlines.
  - Exported range constants and defaults, named so later slices import them as they stand: `WEB_SEARCH_MIN_RESULTS` (1), `WEB_SEARCH_MAX_RESULTS` (20), `WEB_SEARCH_DEFAULT_RESULTS` (10), `WEB_SEARCH_MIN_CHARS` (200), `WEB_SEARCH_MAX_CHARS` (100000), `WEB_SEARCH_DEFAULT_MAX_CHARS` (10000), `WEB_SEARCH_DEFAULT_DEPTH` (`'basic'`), and `WEB_SEARCH_DEFAULT_PROVIDER` (`'auto'`). Name them like `FILE_GLOB_DEFAULT_LIMIT` / `FILE_GLOB_MAX_LIMIT` in `src/file-glob/command.ts`. The remote operation's `valid` (`./product/plans/complete/web-search-7-remote-operation.md`) checks against the min/max constants, so the usage line's numbers and the constants must agree; the usage string is written as a literal and a test pins it against the constants.
  - `WebSearchDepth` (`'basic' | 'advanced'`) and the parsed request type `WebSearchCommand` (`query`, `numResults`, `maxChars`, `depth: WebSearchDepth`, `provider`, all required). This is the shape the search core, the remote operation, and the typed command all pass around; the defaults are filled in by `parseWebSearch`, so no consumer applies defaults of its own.
  - `isWebCommandLine(line)` and `isWebSearchReplyLine(line)` as described above. Neither trims; callers pass a trimmed command or a cleaned reply line, as with `isFileGlobCommandLine`.
  - `parseWebSearch(line)` returning `WebSearchCommand | { error: string }`, where the error is always `WEB_SEARCH_USAGE` (the same union `parseFileGlob` returns). It applies the tokenizing, query, flag, and range rules under Design decisions, scanning flags with one scanner per flag that refuses a repeat or a missing value, in the shape of `scanArguments`/`scanFlag` in `src/file-glob/command.ts`. A token that is neither a flag nor a flag's value, once the first flag has been seen, returns the usage line. Every malformed form listed under Usage line returns the usage line.
- Expected size is about 110 counted lines. If it would pass the 200-line `max-lines` limit, extract the flag scanner into `src/web-search/command-flags.ts` rather than compacting. Keep `parseWebSearch` and each scanner under the `sonarjs/cognitive-complexity` limit (~15) by giving each flag its own small scanner function, as `src/file-glob/command.ts` does.
- Until later slices consume them, every export is imported by `command.test.ts`, which keeps `knip` from reporting them as unused.

## Tests

`src/web-search/command.test.ts` (new, vitest `server` project, in the style of `src/file-glob/command.test.ts`):

- Query taken up to the first `--` token, trimmed, with whitespace runs (tabs and multiple spaces) collapsed to one space.
- Quotes and `site:` / `-site:` operators kept exactly as typed; a `-site:` word is part of the query, not a flag.
- `Web Search x` parses (the typed form is case-insensitive).
- `--provider` value kept as typed (`--provider Tavily` gives `Tavily`); `--provider auto` and an unregistered name both parse.
- Defaults when no flag is given: 10 results, 10000 characters, `basic`, `auto`.
- Flags in any order, each one parsed into its field.
- Range edges: `--results` 1 and 20 accepted, 0 and 21 refused; `--max-chars` 200 and 100000 accepted, 199 and 100001 refused; non-whole values (`1.5`, `abc`, `-3`) refused.
- `--depth` accepted case-insensitively (`ADVANCED` parses as `advanced`); any other value refused.
- Every usage case returns exactly `WEB_SEARCH_USAGE`: bare `web`, `web foo`, bare `web search`, an empty query (`web search --results 3`), an unknown flag (including `--Results` and `--results=5`), a repeated flag, a flag with no value (last token, and followed by another `--` flag), out-of-range values, and a word after the flags.
- `WEB_SEARCH_USAGE` equals the exact usage line, and the numbers in it match `WEB_SEARCH_MIN_RESULTS`, `WEB_SEARCH_MAX_RESULTS`, `WEB_SEARCH_MIN_CHARS`, and `WEB_SEARCH_MAX_CHARS`.
- `isWebCommandLine` claims `web`, `Web search x`, `web foo`, and rejects `webby`, `websearch`.
- `isWebSearchReplyLine` accepts `web search x`, `web  search x`, and bare `web search`, rejects `Web search found three results.`, `WEB SEARCH x`, and `web searching`.
- `WEB_SEARCH_PRIMER` equals the six lines above in order, and contains no four-digit year other than the example's.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- No manual end-to-end check: this slice registers nothing and changes no user-visible behavior. The first manual check is in `./product/plans/complete/web-search-10-typed-command.md`.

## Out of scope

- Running a search, providers, rendering, registering the `web` command, and any ACP wiring (later subplans of `./product/plans/complete/web-search.md`).
- Validating the provider name (`./product/plans/complete/web-search-5-provider-registry.md`).
- Completion (`./product/plans/ready/web-search-14-completion.md`).
- A JSON argument form (user decision).
