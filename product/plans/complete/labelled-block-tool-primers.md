# Labelled block tool primers

**Complexity: 6/10** — ~30 added lines across 12 production files, 8 requirements and 16 test scenarios, all edits to existing constant strings with no new production unit (p=6.02).

Make every per-tool primer agree with the command-protocol primer and the shared extractor: a command goes inside a final fenced block whose info string is exactly `janissary`, never on a bare final line. The core prompt currently joins these tool primers with a protocol that already states the block rule, so a model that follows a more specific tool primer emits a bare line that the new extractor treats as prose — the headline feature then fails silently. Aligning the wording removes that contradiction while leaving extraction, gating, and the legacy whole-reply extractors untouched.

## Design decisions established by the code and the finding

- The block rule is already stated once by `commandProtocolPrimer` in `src/acp/command-protocol.ts` and by `agentPrimer` in `src/agent/command-tools.ts`; the per-tool primers are the remaining contradictory voice.
- `toolExtractor` in `src/acp/tool-table.ts` reads the command from the last closed labelled block via `extractCommandBlock`; a bare final line is prose and ends the run.
- Each rewritten instruction must say: put exactly one command inside a final fenced block whose info string is exactly `janissary`, write it without a `janissary` prefix, and prose may follow the block.
- Each tool keeps its own grammar lines, worked example, and any explicit final-answer-and-no-trailing-command sentence. Only the bare-final-line instruction changes.
- `extractDatabaseCommand`, `extractBrowserCommand`, and `extractQuestionCommand` and their `findLastCommandLine` calls stay as they are; they are legacy whole-reply extractors, not the ACP loop path.
- `command-block.test.ts`, the labelled-block extraction/gating cases in `tool-table.test.ts`, and `drive-loop.test.ts` keep their assertions unchanged.
- The quoted primer text in `product/specs/acp.md` that still describes a bare final notify line is updated; `product/specs/agent-command.md` is a separate recorded finding and is out of scope.

## What already exists (reuse, don't rebuild)

| Existing code | What it does | How this plan reuses it |
| --- | --- | --- |
| `src/acp/command-protocol.ts` (`commandProtocolPrimer`) | States the block rule once per prompt. | Copy its wording into each tool primer rather than inventing a second rule. |
| `src/acp/command-block.ts` (`extractCommandBlock`) | Reads one command from the last closed labelled block. | Leave untouched; the primers only describe what it already accepts. |
| `src/acp/tool-table.ts` (`toolPrimer`, `toolExtractor`) | Joins the per-tool primers and extracts/gates the block command. | Leave the join and extractor unchanged; only the imported primer strings change. |
| `src/acp/command-line.ts` (`findLastCommandLine`) | Legacy whole-reply extraction helper. | Leave untouched; the three legacy extractors still call it. |
| Colocated Vitest primer assertions | Pin exact primer strings and line counts in the server project. | Update the literal expectations and add a labelled-block assertion where none existed. |

## Proposed changes

Rewrite the leading instruction of each `file`-family primer in `src/file-read/command.ts`, `src/file-write/command.ts`, `src/file-glob/command.ts`, `src/file-grep/command.ts`, `src/file-patch/command.ts`, and every form in `src/acp/file-primer.ts` (directory list, stat, exists, head, tail). Each keeps its grammar line(s) and example lines byte-for-byte; the first line alone changes from "end your reply with one line" to the labelled-block instruction, so the asserted line counts stay the same.

Rewrite the leading instruction of `WEB_SEARCH_PRIMER` in `src/web/search/command.ts` and `WEB_FETCH_PRIMER` in `src/web/fetch/command.ts` the same way, leaving their grammar, guidance, and example lines alone.

Reflow the prose that carries the bare-line rule in `BROWSER_PRIMER` (`src/browser/command.ts`), `DB_PRIMER` (`src/database/primer.ts`), `QUESTION_PRIMER` (`src/question-command.ts`), and `NOTIFY_PRIMER` (`src/notifications/primer.ts`) so each says the command goes in a final `janissary` fenced block without a prefix and prose may follow, while preserving each tool's syntax block, worked details, and final-answer-and-no-trailing-command sentence. Do not edit the `extractBrowserCommand`, `extractDatabaseCommand`, or `extractQuestionCommand` functions or their import of `findLastCommandLine`.

Update the colocated primer assertions: the exact-string expectations in `src/file-read/command.test.ts`, `src/file-glob/command.test.ts`, `src/file-grep/command.test.ts`, `src/web/search/command.test.ts`, `src/web/fetch/command.test.ts`, and `src/notifications/primer.test.ts`; add labelled-block assertions alongside the existing `toContain` checks in `src/file-write/command.test.ts` and `src/file-patch/command.test.ts`; add matching assertions in `src/browser/command.test.ts`, `src/question-command.test.ts`, and `src/database/manager.test.ts`; and add `src/acp/file-primer.test.ts` for the five directory/head/tail forms, which had no colocated test. Keep every line-count, example-parsing, and no-trailing-command assertion intact.

In `product/specs/acp.md`, change the sentence that says the notify primer tells the agent to end a reply with one `notify <message>` line to say it tells the agent to put exactly one such command inside a final fenced block whose info string is exactly `janissary`. Leave the rest of the paragraph and the rest of the spec alone.

## Implementation steps

1. Rewrite the five `file`-family primers and the five forms in `src/acp/file-primer.ts`, then run `$janissary/scripts/run.mjs check-diff`.
2. Rewrite the two web primers and the four caller-side primers (browser, database, question, notify), without touching the legacy extractors, then run `$janissary/scripts/run.mjs check-diff`.
3. Update the colocated test expectations and add the new file-primer test, then run `$janissary/scripts/run.mjs check-diff`.
4. Update the quoted notify-primer sentence in `product/specs/acp.md`, then run `$janissary/scripts/run.mjs check-diff`.

## Tests

- Each exact-string assertion is updated to the new first line only; grammar lines, examples, and line counts stay as asserted today.
- `src/acp/file-primer.test.ts` asserts each of the five forms names a final fenced block with info string exactly `janissary`, keeps its grammar line, and no longer says "end your reply with one line".
- `src/file-write/command.test.ts` and `src/file-patch/command.test.ts` keep their existing `toContain`/line-count/example tests and gain an assertion that the primer names the labelled block.
- `src/browser/command.test.ts`, `src/question-command.test.ts`, and `src/database/manager.test.ts` gain an assertion that their primer names the labelled block and no longer instructs a bare final line; their legacy extractor tests stay unchanged.
- `src/acp/command-block.test.ts`, `src/acp/tool-table.test.ts`, and `src/acp/drive-loop.test.ts` are not edited and must stay green.
- Full server suite stays green via `$janissary/scripts/run.mjs check-diff` after each step.

## Out of scope

- No change to `extractCommandBlock`, `toolExtractor`, `gateCommand`, or the loop's three-variant handling.
- No change to `cleanCommandLine`, `findLastCommandLine`, or the three legacy whole-reply extractors.
- No change to `product/specs/agent-command.md`; that is a separate recorded finding.
- No new primer constant module or shared helper; the wording lives in each existing primer.
- No change to command grants, help pages, or user documentation beyond the spec sentence named above.

## Verification

- `$janissary/scripts/run.mjs check-diff` after each step; the full server suite must pass.
- `npm run check` is the human's gate and is never run here.
