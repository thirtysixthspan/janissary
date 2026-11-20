# Verify multi-command batches across every tool-loop consumer

**Complexity: 1/10** — no production edits planned, 2 integration requirements and 5 verification scenarios (p=3.01).

Source plan: `./product/plans/complete/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example.md`. Depends on all earlier subplans: `./product/plans/ready/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example-1-batch-extraction.md`, `./product/plans/ready/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example-2-tool-ownership.md`, `./product/plans/ready/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example-3-parallel-batch-loop.md`, `./product/plans/ready/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example-4-agent-protocol-and-spec.md`, and `./product/plans/ready/allow-acp-sessions-to-accept-multiple-tool-calls-in-a-single-message-for-example-5-remote-forwarding.md`. No later subplans.

## Goal

Close out the feature by confirming the whole change hangs together: every consumer of the shared tool loop accepts several commands in one reply, the boundaries the source plan declares out of scope stayed untouched, and the end-to-end behavior works locally and on a remote-hosted session. This subplan owns the integration checks and manual verification the source plan lists; it makes no production code change of its own.

## Decisions and dependencies

- Depends on subplans 1 through 5 being complete. It does not re-implement or re-scope any of them; it verifies their seams meet.
- All production consumers reach the loop through `driveToolLoop` / `runToolLoop`, which call `runAcpToolLoop` with the two extraction providers. Confirm by inspection that local ask/tell prompts (`src/acp/run-prompt.ts`), agent runs (`src/agent/execute.ts`), plugin-owned sessions, subagent attempts (`src/subagent/attempt.ts`), and remote-hosted loops (`src/remote/serve-acp-loop.ts`) all use that path, so they inherit batch behavior without separate edits. If inspection finds a consumer that bypasses it, record that as the one concrete code change this subplan may need and add a test for it.
- No new wire frame, RPC, client UI, or command-bar change. No change to the eight-step cap, cold-start retry, or the no-block final-answer rule. Verify these stayed true rather than changing them here.
- The spec, primer, correction sentence, and refusal text must still match the code exactly after all earlier subplans landed.

## What already exists (reuse, don't rebuild)

| Need | Existing piece | Location |
| --- | --- | --- |
| Shared loop entry for all local consumers | `driveToolLoop`, `runToolLoop` | `src/acp/drive-loop.ts` |
| Core prompt consumer | `runToolLoop` call | `src/acp/run-prompt.ts` |
| Agent-run consumer | `runToolLoop` call | `src/agent/execute.ts` |
| Subagent consumer | `runToolLoop` call | `src/subagent/attempt.ts` |
| Remote consumer | `startRemoteLoop` driving `driveToolLoop` | `src/remote/serve-acp-loop.ts` |
| Authoritative behavior spec | Autonomous tool loop section | `product/specs/acp.md` |
| Diff-scoped development gate | `$janissary/scripts/run.mjs check-diff` | Project tooling |

## Proposed changes

No production code change is planned. The work is the verification below. If inspection finds a consumer outside the shared path, route it through `driveToolLoop` or `runToolLoop` as part of this subplan and add a colocated test for that consumer; do not leave a second extraction path in place. If inspection finds none, make no code change here. Every production caller seen in the current tree funnels through that function, so the no-change outcome is expected.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` over the complete change set; it must be clean.
- Grep for `runAcpToolLoop`, `driveToolLoop`, `runToolLoop`, `extractCommandBlock`, and `toolExtractor`, and confirm every local ask/tell, plugin-owned session, agent-run, subagent, and remote consumer reaches the batch-aware loop, with no second extraction path left behind. The known call sites are `src/acp/run-prompt.ts`, `src/agent/execute.ts`, `src/subagent/attempt.ts`, and `src/remote/serve-acp-loop.ts`.
- Confirm no new `acp-*` wire frame or client UI appeared and `CORE_MAX_STEPS` is still eight.
- Confirm the spec's quoted primer, correction sentence, and refusal text match `commandProtocolPrimer`, `CORRECTION_PROMPT`, and the cap branch exactly.
- Manual, local: in an ACP session with file tools granted, ask the agent to investigate a question that needs several file searches. Confirm it can issue them as several `janissary` blocks in one reply, that each command and its output appears as its own tool entry in the connection tab, that one follow-up message arrives per finished command in completion order, and that the agent then answers without another command.
- Manual, remote: repeat on a remote-hosted session and confirm the tool results still correlate to their caller commands.
- Confirm every touched source file stays under the 200-line `max-lines` limit.

## Out of scope

- No new feature, transport, tab, command, or UI.
- No change to the cap value, the cold-start retry, the no-block final-answer rule, or the correction for an empty or malformed block.
- No configurable batch size, per-command timeout, or per-result message format other than the existing `Output of` block.
- No commits, pull request, or publication; this subplan only verifies and records.
