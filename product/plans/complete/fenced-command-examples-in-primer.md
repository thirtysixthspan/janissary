# Show a fenced usage example for each command in the ACP primer

**Complexity: 6/10** — ~116 added production lines across 14 primer files, 3 requirements and 18 test scenarios (p=5.86)

## Summary

Per the PR backlog: "for each command in the preamble, provide a usage example of the command with a fenced block." The preamble the model receives is assembled by `toolPrimer` in `src/acp/tool-table.ts` from each granted tool owner's primer. Those primers describe every native command with a syntax line and explain that a command must be placed inside a fenced block whose info string is exactly `janissary`. A few primers end in an `Example: <command>` line, but that example is bare text, not a fenced block, and most primers carry no example at all. A model reading the preamble is told the fence rule in prose but never shown a concrete fenced example for a command. This change adds a real `janissary` fenced-block usage example for every command documented in the preamble, so the required format is demonstrated rather than only described.

## Goal

- Every command documented in an ACP tool primer has at least one usage example shown inside a fenced block whose info string is exactly `janissary`.
- Each fenced example holds exactly one valid command of the grammar it illustrates, so a model can copy the shape.
- Existing prose, syntax lines, warnings, and reply strings in every primer stay unchanged; only new fenced examples are added, and existing bare `Example:` lines are converted into fenced examples.
- The command-exchange protocol, the allow-list line, the no-tools line, and the role instructions are untouched.

## Design decisions

- **One shared formatter for the fence.** A small pure module `src/acp/command-example.ts` exports `commandExample(command): string` returning the three lines that open a `janissary` fence, hold the command, and close the fence. This is the single source of truth for the exact fence shape, which is the whole point of the change, and keeps the literal backticks out of fourteen files. (Chosen over repeating the three fence lines in every primer, which would scatter the format-defining string and invite drift.)
- **An `Example:` label line introduces each fenced block.** Where a bare `Example: <command>` line already existed, that line becomes the label and the command moves into the fence below it. Where none existed, an `Example:` label and a fence are added after the command's syntax and explanatory lines. (Chosen over a bare fence, so the model reads it as an illustration rather than a second instruction.)
- **Every documented command gets its own block.** Primers that describe several commands (file write/edit, browser, question, database) get one fenced example per command, not one for the group, matching "for each command". The mutation primer's two JSON commands each get a fenced example.
- **Existing examples keep their exact command text.** The glob, grep, patch, web search, and web fetch examples are moved verbatim into their fences, including the grep backslash and the escaped JSON newlines, using `String.raw` where the source already relies on it. This preserves the "example command parses" test intent.

## What already exists (reuse, don't rebuild)

| Need | Existing thing to reuse | Location |
| --- | --- | --- |
| The exact fence info string | `commandProtocolPrimer` wording and `extractCommandBlock` fence matching | `src/acp/command-protocol.ts`, `src/acp/command-block.ts` |
| Primer assembly and verbatim spec quotes | `toolPrimer` and the tool/command sections | `src/acp/tool-table.ts`, `product/specs/acp.md` |
| Exact-primer tests to extend | The `*_PRIMER` / primer blocks in each command test | `src/**/*.test.ts` beside each primer |

## Proposed changes

**New shared helper.** `src/acp/command-example.ts`: export `commandExample(command: string): string` returning `['```janissary', command, '```'].join('\n')`.

**Add a fenced example to each command primer** (importing `commandExample` from `../acp/command-example.js` at each site with the correct relative depth, `.js` extension included):

1. `src/file-read/command.ts` — `FILE_READ_PRIMER`: `file read README.md`.
2. `src/file-glob/command.ts` — `FILE_GLOB_PRIMER`: convert the existing bare `Example:` line to a fenced block around `file glob **/*.test.ts --path src`.
3. `src/file-grep/command.ts` — `FILE_GREP_PRIMER`: fenced block around the existing `file grep --include *.ts function\s+parse` example (keep `String.raw`).
4. `src/file-write/command.ts` — `FILE_MUTATION_PRIMER`: convert the existing write example to a fenced block, add a second fenced block for `file edit`.
5. `src/file-patch/command.ts` — `FILE_PATCH_PRIMER`: fenced block around the existing patch example (keep `String.raw`).
6. `src/acp/file-primer.ts` — `FILE_LIST_PRIMER`, `FILE_STAT_PRIMER`, `FILE_EXISTS_PRIMER`, `FILE_HEAD_PRIMER`, `FILE_TAIL_PRIMER`: one fenced example each.
7. `src/web/search/command.ts` — `WEB_SEARCH_PRIMER`: fenced block around the existing search example.
8. `src/web/fetch/command.ts` — `WEB_FETCH_PRIMER`: fenced block around the existing fetch example.
9. `src/browser/command.ts` — `BROWSER_PRIMER`: fenced examples for `browser goto`, `browser content`, `browser eval`.
10. `src/question-command.ts` — `QUESTION_PRIMER`: fenced examples for `question ask` and `question approve`.
11. `src/database/primer.ts` — `DB_PRIMER`: fenced examples for `db sqlite create`, `delete`, `query`, `list`.
12. `src/subagent/primer.ts` — `SUBAGENT_PRIMER`: fenced example for the JSON subagent command.
13. `src/commands/tab-primer.ts` — `TAB_PRIMER`: fenced example for `tab focus`.
14. `src/notifications/primer.ts` — `NOTIFY_PRIMER`: fenced example for `notify`.

Each affected file stays well under the 200-line `max-lines` cap; no compaction. No barrel files, no wire-type changes, no loop or gate changes.

## Tests

- `src/acp/command-example.test.ts` (new): `commandExample` returns exactly the open line, the command, and the close line, with the `janissary` info string.
- Extend the exact-primer tests beside each changed primer (`file-glob/command.test.ts`, `file-grep/command.test.ts`, `file-write/command.test.ts` if present, `file-patch/command.test.ts` if present, `web/search/command.test.ts`, `web/fetch/command.test.ts`, `file-read/command.test.ts` if present, `acp` primer tests, `browser/command.test.ts`, `question-command.test.ts`, `database` primer tests, `subagent/primer.test.ts`, `commands` tab-primer tests, `notifications` primer tests): update the expected string to include the new fenced block(s) and assert each primer contains a `janissary` fenced block holding one command.
- Keep the existing "example command parses" test for web fetch working by extracting the command from inside the fence rather than taking the last bare line.

## Spec

- `product/specs/acp.md`: update every primer block quoted verbatim (file read, glob, grep, mutation prose, patch, web search, web fetch, file list/stat/exists/head/tail) to include the new fenced example, using a four-backtick outer fence where the quoted text now contains triple-backtick fences. Note that the caller-side tool primers (browser, question, database, subagent, tab, notify) likewise show a fenced example for each command they document.

## Docs

- None. The primers are agent-facing protocol text, not user documentation; `help/` and `documentation/user-documentation/` do not quote the primer text, and no documented command, flag, or default changes.

## Out of scope

- Changing the command-exchange protocol (`commandProtocolPrimer`), the allow-list or no-tools lines, or any role instruction.
- Changing command parsing, gating, extraction, batching, or tool-table ownership.
- Changing PR description text.
- Creating new user-documentation pages.
