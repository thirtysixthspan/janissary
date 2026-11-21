# Pair each batched tool command with its reply in connection records

**Complexity: 5/10** — ~65 added production lines, 10 files, 5 requirements, 11 scenarios (p=5.70); a phase discriminator is threaded through the record types and three tool-loop producers, no new module.

## Goal

When an agent issues several commands in one reply, a connection record currently shows commands paired with commands and results paired with results, because the web renderer pairs adjacent `tool` activities. Each command must instead be shown once with its own result as the reply, correctly labelled, for every consumer of the batched tool loop.

## Approach

- Add two optional fields to tool activities: `toolPhase: 'command' | 'reply'` and `toolCommand?: string`. A command activity carries `toolPhase: 'command'`; the matching result activity carries `toolPhase: 'reply'` and the originating command text in `toolCommand`. The fields are optional so records written before this change and producers that do not emit them still render.
- Thread the two fields through the single record store (`AcpSessionRecords.activity`) and the two producer wrappers (`coreActivity`, `AgentRecordFeed.activity`) so every entry that reaches a connection window can carry them.
- Set the fields at the three tool-loop producers that emit paired `startCommand`/`ranCommand` activities: core prompts (`src/acp/run-prompt.ts`), agent runs (`src/agent/execute.ts`), and subagent attempts (`src/subagent/attempt.ts`). `ranCommand` already receives the command text, so the correlation costs no new plumbing.
- Teach `groupToolEntries` in `web/src/plugins/connections/activity-text.ts` to collect phased commands in order and attach each phased reply to the command it names (falling back to the oldest unmatched command). Tool entries with no phase keep the existing adjacent-pairing behavior, so older records and unphased producers are unchanged.
- Validate the optional fields where connection payloads and durable records are decoded, rejecting a bad phase rather than rendering it as a command.

## Implementation steps

1. `src/acp-records/types.ts` and `src/plugins/connections/shared.ts` — add `toolPhase?: 'command' | 'reply'` and `toolCommand?: string` to `AcpRecordEntry` and `ConnectionActivity`.
2. `src/acp-records/validation.ts` and `src/plugins/connections/shared.ts` — accept the new optional fields only when `toolPhase` is one of the two values and `toolCommand` is a string; leave entries without them valid.
3. `src/acp-records/manager.ts` — extend `activity(id, kind, text, phase?, command?)` to store the fields on the appended entry; `appendActivity` in `src/acp-records/model.ts` already preserves every field of a `tool` entry it pushes.
4. `src/acp/record-feed.ts` — let `coreActivity` accept and forward the optional phase and command to `records.activity`.
5. `src/agent/record-feed.ts` — let `AgentRecordFeed.activity` accept and forward the optional phase and command.
6. `src/acp/run-prompt.ts` — have `recordTool` take an optional phase and command, and pass `'command'` at `startCommand` and `'reply'` plus the command at `ranCommand`.
7. `src/agent/execute.ts` and `src/subagent/attempt.ts` — pass the same phase and command values at their `startCommand` and `ranCommand` (or `toolActivity`) call sites.
8. `web/src/plugins/connections/activity-text.ts` — rewrite `groupToolEntries` to pair phased commands and replies by `toolCommand` while preserving source indices and the legacy path for unphased entries.
9. Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `web/src/plugins/connections/activity-text.test.ts`:
  - two commands followed by two replies produce two rows, each command with its own reply;
  - replies carrying `toolCommand` attach to the matching command even when results arrive out of order;
  - several batches inside one block stay paired batch by batch;
  - a reply without a matching command is still rendered rather than dropped;
  - tool entries without a phase keep the existing adjacent pairing;
  - non-tool entries and source indices are unchanged.
- `src/acp-records/manager.test.ts` and `src/acp-records/validation.test.ts`: a tool activity with a phase and command round-trips through the store and validates; an invalid phase is rejected on load.
- `src/plugins/connections/shared.test.ts`: a window whose tool entries carry the new fields validates, one with an invalid phase does not.
- `src/acp/run-prompt.test.ts` and `src/agent/execute.test.ts`: the record receives `'command'` at `startCommand` and `'reply'` with the originating command at `ranCommand`.
- Run `$janissary/scripts/run.mjs check-diff` after the tests.

## Spec and documentation

- `product/specs/acp-records.md`: describe that a connection record marks each tool command and its result and shows them as one paired tool activity even when several commands run in one batch; note that records without the marker fall back to adjacent pairing.
- `product/specs/connections-tab.md`: state that a tool row shows one command and its reply, including when a batch produces several commands and results.
- No `help/` or user-documentation change: no command, flag, key binding, or documented user behavior changes.

## Out of scope

- Correlating results by ACP `toolCallId` from raw session-update monitoring; those producers keep adjacent pairing.
- Changing what text a command or result activity contains, or the tab transcript rendering.
- Adding a command/reply discriminator to non-tool activity kinds.
- Rewriting or migrating records already stored on disk.
- Changing the loop's parallel execution, delivery order, or step budget.
