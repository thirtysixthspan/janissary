# Tell-session preamble: collect all input and execute all tasks before the final summary

**Complexity: 1/10** — ~1 added production line in 1 file, 2 requirements and 3 test scenarios (p=3.313)

## Summary

Per the PR backlog: "add to the preamble for tell session for the model to collect all input and execute all tasks before providing a final summary message. the final summary should be a summary of the work that was done." A core ACP `tell` session's preamble is built by `corePrimer` in `src/acp/drive-loop.ts`, which already appends a role-specific `TELL_INSTRUCTION` after the command-exchange protocol and before the Markdown instruction. The recent ask-preamble change added the matching "gather all input before the final response" line for `ask`, but `tell` still says only "briefly report what you did." With a single reply now able to carry several command blocks, a tell model can write its final summary from the first result it sees instead of waiting for every command's output. This extends the existing tell instruction so it directs the model to gather all command input and finish every task before the final summary, and to make that summary a summary of the work it did.

## Goal

- A `tell` session preamble instructs the model to gather all the input it needs from its commands and execute all the tasks before producing a final summary message, and to make that final summary a summary of the work that was done.
- The `tell` instruction keeps its exact current placement (after the command-exchange protocol, before the Markdown instruction) and its current emission condition (only for the `tell` role, including when the tab runs without tools).
- The `ask` role's `ASK_INSTRUCTION`, the tool primers, the command-exchange protocol, and the Markdown instruction stay exactly as they are.

## Design decisions

- **Edit the existing `TELL_INSTRUCTION` constant in place.** It already occupies the right slot in `corePrimer`, so changing its text delivers the behavior with one production-line change. (Chosen over adding a second tell constant, which would either duplicate the "briefly report" line or leave two competing instructions.)
- **Exact new text:** "The user is instructing you to carry out a task. Gather all the input you need from your commands and execute all the tasks before providing a final summary message. The final summary must be a summary of the work that was done." This keeps the task framing and mirrors the ask instruction's "gather input before the final message" shape while adding the tell-specific work-summary requirement.
- **No change to emission gating.** `TELL_INSTRUCTION` is emitted for the tell role whether or not tools are available, as it is today; the no-tools tell primer keeps its instruction with the new wording. (Chosen over gating it on `toolsAvailable`, which would change other behavior and force spec and test churn beyond this entry.)

## What already exists (reuse, don't rebuild)

| Need | Existing thing to reuse | Location |
| --- | --- | --- |
| Role-specific tell primer line and its slot | `TELL_INSTRUCTION` and the `corePrimer` array | `src/acp/drive-loop.ts` |
| Primer expectations for tell and ask, with and without tools | `corePrimer` and `corePromptPrimer` test blocks | `src/acp/drive-loop.test.ts`, `src/acp/run-prompt.test.ts` |
| The spec that quotes the tell instruction | tell command section | `product/specs/acp.md` |
| The help note that describes the tell primer | Notes section of the tell command page | `help/tell.md` |

## Proposed changes

**Server: extend `TELL_INSTRUCTION` in `corePrimer`.** In `src/acp/drive-loop.ts`, replace the value of the module-level `const TELL_INSTRUCTION` with the exact new text above. No other production file changes, no new imports, and no import-extension changes. The file stays well under the 200-line `max-lines` cap.

## Tests

- `src/acp/drive-loop.test.ts` (`corePrimer`): update the local `TELL_INSTRUCTION` expectation to the new text so the existing exact-equality ordering tests pin it; add a case asserting the tell primer carries both new clauses ("Gather all the input you need from your commands and execute all the tasks before providing a final summary message." and "The final summary must be a summary of the work that was done."), no longer carries "briefly report what you did", and that the ask primer still carries no tell instruction.
- `src/acp/run-prompt.test.ts` (`corePromptPrimer` / `runCorePrompt role primer`): update the local `TELL_INSTRUCTION` expectation to the new text so the existing exact-equality and no-tools tell cases pin it; add a case asserting the new clauses appear in the tell primer and not in the ask primer.

## Spec

- `product/specs/acp.md`: replace the quoted tell instruction in the Commands section with the new exact text and state that it directs the model to collect all command input and finish all tasks before a final summary that summarizes the work done. Leave the ask instruction and the rest of the command behavior intact.

## Docs

- `help/tell.md`: update the Notes sentence describing the tell primer to say it asks the model to gather all input and run all its tasks before a final summary of the work done. Only this existing page describes the primer text; no new documentation.

## Out of scope

- Changing `ASK_INSTRUCTION`, the tool primers, the command-exchange protocol, or the Markdown instruction.
- Changing where or under what condition `TELL_INSTRUCTION` is emitted.
- Changing ACP loop, tool extraction, batching, or how replies and preambles are recorded.
- Creating new user-documentation pages; the user docs describe tell at a goal level that remains accurate.
