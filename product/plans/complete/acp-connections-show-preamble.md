# Show the preamble on every tracked ACP connection

**Complexity: 4/10** — ~20 added lines across six production files, five requirements and seven test scenarios, plus one shared primer helper (p=5.12); a narrow extension of the subagent precedent, not new architecture.

## Goal

A tracked ACP connection's tab shows the prompt blocks the model was given. Subagent records already prepend the command primer to the first prompt so the reader sees the complete provider input, but core `ask`/`tell` sessions and ordinary agent runs store only their logical prompt and leave the preamble out. Every tracked ACP connection should show the preamble that was sent when its session opened, so the connection tab reads the same as the model saw.

## Approach

Compute the exact primer each connection sends at the provider boundary and prepend it to the first prompt stored in the durable record, once, following the subagent design. For core ACP that is `corePrimer` over the prompt's captured snapshot; for agent runs it is the Markdown primer the loop prepends. Preserve the core record's title, which is derived from the first line of the stored prompt, by letting the recorder take a separate title text so the title still comes from the user's prompt rather than the primer.

## Design decisions

1. **Reuse the subagent contract, do not invent a new display surface.** The subagent plan already decided that the connection tab shows the complete input the model was given, with the primer prepended to the logical prompt and the loop still prepending it only once on the raw prompt. Extend that same shape to core and agent records; there is no new field, protocol frame, or UI element.

2. **Derive the stored primer from the snapshot the loop actually uses.** The loop builds `corePrimer(snapshot, tools)` where `snapshot` is the prompt's captured `coreSnapshot` and `tools` honours `withoutTools`. A shared helper builds that same primer from the same inputs at record time, so the recorded text cannot drift from what the provider receives — local and remote prompts alike, because the far side builds its primer from the same snapshot.

3. **Keep the core title tied to the user's prompt.** `recordTitle` takes the first line of the first stored prompt. Prepending a primer would retitle the record to the primer's first line. Add an optional title text to the recorder's `prompt` call: the block stores the primer-inclusive text while the first-block title is derived from the raw prompt. Defaulting the new parameter to the stored text leaves every other caller unchanged.

4. **Agent runs use the Markdown primer, not the command primer.** The tool loop sends only `MARKDOWN_INSTRUCTION` for an `agent` snapshot. Prepend exactly that to the agent record's task prompt, so the recorded text matches the provider input; the task, skill, and parameter text stays verbatim and the title still comes from the task path.

5. **Record once, on the existing reserved block.** The prompt is reserved before the handshake and written when the record exists, across tool turns and cold-start retries. The primer is prepended once to that single stored prompt; the loop's own first-turn primer is unchanged, so the raw and recorded inputs stay identical as they are for subagents.

## Implementation steps

1. `src/acp-records/manager.ts`: add an optional third parameter to `prompt(id, text, titleText = text)`; use it only for the first-block title and keep storing `text` in the block.
2. `src/acp/prompt-state.ts`: add optional `recordPrompt` to `AcpPendingPrompt`.
3. `src/acp/run-prompt.ts`: export a helper that builds the core primer from a runtime, a pending prompt, and a captured native-settings snapshot, reusing `coreSnapshot`, `corePrimer`, and the tool table with the same `withoutTools` gate the loop uses.
4. `src/acp/manager.ts`: in `attempt`, build the primer from the attempt's captured settings, set `request.recordPrompt` to primer plus the raw prompt, and do it before the existing `promptCoreRecord` call so a handshake-time flush sees it.
5. `src/acp/record-feed.ts`: have `promptCoreRecord` store `recordPrompt` when present and pass the raw prompt as the title text.
6. `src/agent/execute.ts`: prepend `MARKDOWN_INSTRUCTION` to the text written to the run record.

## Tests

- `src/acp/record-feed.test.ts`: a focused test that a core record's first stored prompt is the core primer followed by the user prompt, and that the record title still reads `ACP: <user prompt>`; relax the exact-prompt match in the other cases to `stringContaining` where the assertion targets activity or answers.
- `src/acp/run-prompt.test.ts`: a test that the shared helper returns the same primer the loop sends for the same snapshot, including the `withoutTools` case.
- `src/acp-records/manager.test.ts`: a test that the optional title text retitles the first block while the stored prompt stays the full text, and that callers omitting it are unchanged.
- `src/agent/execute.test.ts`: update the first-record assertion to expect the Markdown primer followed by the task prompt.

## Out of scope

- Live tab transcripts, which continue to show the user's typed prompt only; the subagent precedent changes the durable connection record, not the shell log.
- Monitor and editor-persona ACP sessions, which are live-only and have no durable record.
- The text of any primer, the tools granted to any role, or the command protocol itself.
- Conversations and other Markdown-primed consumers that are not tracked ACP connections.

## Verification

`$janissary/scripts/run.mjs check-diff` after each implementation step and after tests.
