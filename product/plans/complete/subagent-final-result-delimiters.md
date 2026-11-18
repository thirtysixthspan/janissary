# Delimit the subagent final result

**Complexity: 4/10** — ~25 added lines across 2 production files plus one new pure module, 5 behavioral requirements and 9 test scenarios (p=4.904)

## Goal

A subagent is asked to finish with a self-contained final result, but nothing today marks where that result begins or ends, so a model's reasoning, streamed thoughts, or embedded tool calls can bleed into the text delivered to the caller. Give the subagent a delimiter contract for its final result and extract that section on the way back: the caller receives only the contents between the delimiters, with the delimiters and everything outside them discarded.

## Design decisions

- The task prompt instructs the subagent to write its final result between `<final_result>` and `</final_result>` tags, to keep reasoning, thoughts, and tool calls outside the tags, and to write nothing after the closing tag. This is guidance in the prompt only; no new command field, flag, or protocol shape is introduced.
- Extraction is a single pure helper applied to the text of the latest completed turn, at the point that text becomes the attempt's response. Every downstream consumer — completion message, human reply, and durable record answer — keeps receiving the same response value, so they all see the clean contents without individual changes.
- The helper returns the contents of the last complete, case-insensitive tag pair, trimmed of the whitespace that surrounds the delimiters. Taking the last pair lets a model that revises its answer inside a later pair win.
- When the turn has no complete tag pair, the text is returned unchanged. This keeps today's behavior for models that ignore the instruction and preserves the existing verbatim-output contract, including empty, whitespace-only, and trailing-whitespace answers.
- Unclosed or empty-tag forms are not special-cased: an unclosed pair has no match and falls through to the unchanged text; an empty pair yields an empty result, which remains a valid completed answer.
- The caller-facing `SUBAGENT_PRIMER` is unchanged. Callers receive already-extracted content and never see the delimiters, so they need no new protocol knowledge.

## Implementation

1. Add `src/subagent/final-result.ts` exporting `extractFinalResult(text: string): string`. It uses one non-greedy, case-insensitive regular expression over `<final_result>` … `</final_result>`, returns the trimmed contents of the last match, and returns the input unchanged when there is no match. Keep the regex free of nested quantifiers so it stays within the security lint rules. Run check-diff.
2. In `src/subagent/primer.ts`, add a paragraph to `subagentTaskPrompt` that tells the subagent to place only its final answer between the two tags, to keep thoughts and tool calls outside them, and that the tags and text outside them are not returned. Keep the existing lead-in, task text, and context ordering. Run check-diff.
3. In `src/subagent/attempt.ts`, import `extractFinalResult` and wrap the `endTurn` text passed to `state.reply`, so the attempt's response is the extracted final result. No other call site changes. Run check-diff.

No production file exceeds the 200-line limit after these edits (`attempt.ts` grows by an import and a wrapped expression); if one does, extract a module rather than compacting code.

## Tests

- **`src/subagent/final-result.test.ts`** (new): extracts and trims the contents of one tag pair; takes the last pair when several are present; drops thoughts and tool-call text outside the tags; returns text unchanged with no tag pair, including whitespace-only and trailing-whitespace text; handles an empty pair; handles multiline contents; matches tags case-insensitively; leaves unclosed tags untouched.
- **`src/subagent/primer.test.ts`**: assert the new guidance names both tags, forbids thoughts and tool calls inside them, and says the tags and outside text are not returned; update the exact-string expectation for the no-context form; keep the existing ordering and no-primer-repetition checks.
- **`src/subagent/attempt.test.ts`**: a delimited completed turn yields the extracted contents as `response`; a turn with no delimiters still yields the verbatim text; the existing verbatim, empty-answer, and chunks/tool-results tests stay green.
- All existing `src/subagent/` suites must pass unchanged apart from the intentionally updated primer expectation.

## Out of scope

- Changing the caller-facing command primer, the message protocol, delivery queue, human reply wording, or any version.
- Changing how thoughts and tool calls are recorded as activity — only the response handed to the caller is affected.
- Changing connection-tab or terminal rendering of the record.
- The other backlog entries (tool preamble and connection transcript) are not part of this fix.

## Documentation and specification impact

`product/specs/subagent.md` covers the task prompt, message contract, human wording, and single-entry execution; those sections are updated in place to describe the delimited final result and its extraction. `help/subagent.md` already documents that the output reaches the caller; its notes are updated in place with the delimiter contract. `help/commands.md` and the user-documentation tree are checked for a description of this behavior and left untouched if none describes it. No new documentation page is created.
