# Show the ACP preamble as its own connection section

**Complexity: 5/10** — ~27 added lines across 12 production files, 6 requirements and 8 scenarios, one new component (p=5.61)

## Goal

A tracked ACP connection's tab currently shows the transport preamble — the tool/command primer the model is given — prepended inside the stored prompt of every query. The reader cannot tell the one-time context apart from the user's own words, and the same primer is written beside each prompt block. The preamble should be captured once, as context when the connection is established, stored apart from the prompt text, and rendered in the connection tab as its own section beside the prompt and the final answer.

## Approach

Add an optional `preamble` field to a connection block. Store the transport primer in that field on the first block of a record only, and store the user's raw prompt in `prompt`. Keep the record title derived from the raw prompt. On the client, render `preamble` in its own labelled section, using the same Markdown rendering as the final answer, between the prompt and the activity entries. Apply the same split to agent and subagent records, whose single block currently carries the Markdown/core primer inline, so every tracked ACP connection renders its context consistently.

## Design decisions

1. **A field on the block, not a new wire frame or surface.** `answer` already lives on the connection block and is rendered separately; `preamble` mirrors it. `recordWindow` spreads each block, so the field travels in the existing connections payload with no new frame, tab, or command. The payload schema version stays unchanged because the field is optional and backward compatible.

2. **Once per connection, on the first block.** `AcpSessionRecords.prompt` already distinguishes the first block (`record.blocks.length === 0`) for titling. The same test gates storing the preamble, so later prompts carry no repeated context. A fallback that begins a fresh record naturally captures the preamble again on that record's first block.

3. **The provider still receives the primer.** This change is about what the durable connection record stores and the tab displays, not about the model input. The loop keeps prepending the primer on the first turn of each prompt; only the recorded/displayed copy moves out of the prompt text. Model-facing protocol strings are untouched.

4. **Raw prompt keeps the title honest.** Because the stored `prompt` is again the user's own text, the existing title-from-first-line behavior keeps working without the separate title-text work around that the inline primer required.

5. **All tracked ACP sources use one rendering.** Core sessions, agent runs, and subagent runs all prepend a primer to their stored prompt today. Moving each into `preamble` makes the new section uniform and removes the inline duplication in every case.

## Implementation steps

1. `src/acp-records/types.ts`: add optional `preamble?: string` to `AcpRecordBlock`.
2. `src/acp-records/validation.ts`: accept an optional string `preamble` in `isBlock`; carry it into the reconstructed record used by `validHistory`.
3. `src/acp-records/manager.ts`: add an optional fourth parameter `preamble` to `prompt(id, text, titleText, preamble?)`; when pushing the first block, include `preamble` when supplied.
4. `src/acp/prompt-state.ts`: replace `recordPrompt?: string` on `AcpPendingPrompt` with `preamble?: string`.
5. `src/acp/run-prompt.ts`: in `prepareCorePromptRecord`, set `request.preamble = corePromptPrimer(runtime, request, settings)` instead of concatenating primer and prompt into `request.recordPrompt`.
6. `src/acp/record-feed.ts`: in `promptCoreRecord`, store the raw `pending.prompt` and pass `pending.preamble` to `records.prompt` as the preamble argument.
7. `src/agent/record-feed.ts`: let `AgentRecordFeed.prompt` take an optional preamble and forward it to the record store. `src/agent/execute.ts`: store the raw prompt and pass `MARKDOWN_INSTRUCTION` as the record preamble.
8. `src/subagent/attempt.ts`: store the raw prompt and pass the computed core primer as the record preamble.
9. `src/plugins/connections/shared.ts`: add optional `preamble?: string` to `ConnectionBlock` and accept it in `isBlock`; leave the payload schema version at 2.
10. `web/src/plugins/connections/ConnectionHistory.tsx`: render a `Preamble` section from `block.preamble` using the same Markdown path as `Answer`, placed after the prompt and before activity entries.
11. `web/src/plugins/connections/connections.css`: include `.connections-preamble` in the existing prompt/answer padding rule so it needs no new selector block.

## Tests

- `src/acp/record-feed.test.ts`: change the preamble test to assert `block.prompt` is the raw user prompt and `block.preamble` is the primer the model received, with the title still from the user prompt; add a case with two prompts showing only the first block carries a preamble.
- `src/acp-records/manager.test.ts`: assert the optional preamble is stored on the first block only, that later blocks omit it, and that callers passing no preamble are unchanged.
- `src/acp-records/validation.test.ts`: accept a block with a string preamble and reject one with a non-string preamble.
- `src/agent/execute.test.ts`: update the first-record assertion to expect the raw task prompt plus `block.preamble` equal to the Markdown primer.
- `src/subagent/attempt.test.ts`: update the record assertions to expect the raw prompt plus the core primer in `block.preamble`.
- `src/plugins/connections/shared.test.ts`: accept a record block carrying a preamble string and reject a non-string preamble.
- `web/src/plugins/connections/ConnectionTab.test.tsx`: render a block with a preamble and assert it appears in its own `.connections-preamble` section, rendered as Markdown, before the prompt's activity and not inside the prompt text.

## Out of scope

- The text of any primer, the tools granted to a role, and the command protocol.
- Model-facing prompt construction: the loop still sends the primer on the first turn of each prompt.
- Live shell transcripts, which continue to show only the user's typed prompt.
- New wire frames, commands, tabs, or a payload schema-version bump.
- Conversations and other Markdown-primed consumers that are not tracked ACP connections.

## Verification

`$janissary/scripts/run.mjs check-diff` after each implementation step and after tests.
