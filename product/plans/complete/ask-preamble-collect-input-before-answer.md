# Ask-session preamble: collect all input before the final answer

**Complexity: 2/10** — ~4 added production lines across 1 file, 2 requirements and 3 test scenarios (p=3.51)

## Summary

Per the PR backlog: "add to the preamble for ask session for the model to collect all input before providing a final response message. the final response should be an answer to the question asked by the prompt". A core ACP `ask` session's preamble is built by `corePrimer` in `src/acp/drive-loop.ts`. The `tell` role already gets a role-specific final line (`TELL_INSTRUCTION`) after the command-exchange protocol and before the Markdown instruction; the `ask` role gets none. With a single reply now able to carry several command blocks, an ask model can answer from the first result it sees instead of waiting for every command's output. This adds an ask-role instruction that tells the model to gather all command input before writing its final response, and that the final response must answer the user's question.

## Goal

- An `ask` session preamble with granted tools instructs the model to collect all command input before producing a final response, and to make that response the answer to the user's prompt.
- The `tell` role's preamble and instruction placement stay exactly as they are.
- An `ask` session with no tools keeps its current preamble (`You have no tools; answer in prose.` followed by the Markdown instruction), because there is no command input to collect.

## Design decisions

- **One new constant beside `TELL_INSTRUCTION`.** `ASK_INSTRUCTION` lives in `src/acp/drive-loop.ts` next to `TELL_INSTRUCTION`, so both role-specific final lines stay colocated with the primer that assembles them. (Chosen over putting the text in `launch.ts`, which owns only the Markdown instruction.)
- **Same slot as the tell instruction.** `corePrimer` appends the ask instruction after the command-exchange protocol and before `MARKDOWN_INSTRUCTION`, mirroring where `TELL_INSTRUCTION` already sits. (Chosen over prepending it, so the protocol still reads first.)
- **Gated on tool availability, not on the role alone.** The ask instruction is emitted only when `toolsAvailable` is true, the same condition that emits the protocol. Waiting for command input only means something when commands can run, and it keeps the no-tools preamble and the plugin `withoutTools` behavior unchanged. (Chosen over an unconditional ask line, which would add a command-gathering instruction to sessions that have no commands and force changes to the no-tools spec and tests.)

## What already exists (reuse, don't rebuild)

| Need | Existing thing to reuse | Location |
| --- | --- | --- |
| Role-specific primer line and its slot | `TELL_INSTRUCTION` and the `corePrimer` array | `src/acp/drive-loop.ts` |
| The no-tools condition the instruction keys off | `toolsAvailable` local in `corePrimer` | `src/acp/drive-loop.ts` |
| Primer expectations for ask and tell, with and without tools | `corePrimer` and `corePromptPrimer` test blocks | `src/acp/drive-loop.test.ts`, `src/acp/run-prompt.test.ts` |
| The spec that names the tell instruction and its placement | tell command and protocol sections | `product/specs/acp.md` |

## Proposed changes

**Server: `ASK_INSTRUCTION` in `corePrimer`.** In `src/acp/drive-loop.ts`, add a module-level `const ASK_INSTRUCTION` next to `TELL_INSTRUCTION`, with text along the lines of "Gather all the input you need from your commands before providing a final response. The final response must answer the question in the user prompt." Add one entry to the array `corePrimer` joins: `toolsAvailable && snapshot.role === 'ask' ? ASK_INSTRUCTION : ''`, placed between the protocol entry and `MARKDOWN_INSTRUCTION`. No other production file changes. All relative imports stay as they are. The file is well under the 200-line `max-lines` cap.

## Tests

- `src/acp/drive-loop.test.ts` (`corePrimer`): an ask snapshot with a granted command includes the new ask instruction after `commandProtocolPrimer(maxToolSteps())` and before `MARKDOWN_INSTRUCTION`, and still does not include `TELL_INSTRUCTION`; the existing no-tools case still yields only the no-tools line and the Markdown instruction.
- `src/acp/run-prompt.test.ts` (`corePromptPrimer`): an ask request with a granted command carries the same instruction in the same slot; the tell case still carries only `TELL_INSTRUCTION`, and the ask no-tools cases still omit it.

## Spec

- `product/specs/acp.md`: name the ask instruction's exact text and state that it follows the command-exchange protocol and precedes the Markdown instruction for ask sessions with available tools, and that no-tools ask sessions carry no such line. Leave the tell instruction and the no-tools description otherwise intact.

## Out of scope

- Changing `TELL_INSTRUCTION`, the tool primers, the command-exchange protocol, or the Markdown instruction.
- Changing ACP loop, tool extraction, batching, or how replies and preambles are recorded.
- Changes to the ask role's model entries or command grants.
- Help or user-documentation changes unless an existing page already describes the preamble text.
