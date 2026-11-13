# Hosted write tool 12 — `file write` and `file edit` as core ACP tools on local tabs

**Complexity: 5/10** — ~30 added lines across 3 files, 7 requirements, 15 scenarios (p=5.42).

Source plan: `./product/plans/complete/janissary-hosted-agent-write-tool.md`. Run order: 12 of 15 in the hosted write tool series. Depends on plan 2 (`janissary-hosted-agent-write-tool-2-mutation-parser.md`), plan 3 (`janissary-hosted-agent-write-tool-3-agent-mutation-refusal.md`), and plan 11 (`janissary-hosted-agent-write-tool-11-typed-file-mutations.md`) for the tab runner.

With the typed commands working, core `ask`/`tell` runs can be handed the same operations as Layer 2 tools: a primer, the existing file `AcpTool` entry, the command taken from the reply's last recognized line, and host execution. No new ACP method. This plan adds the vocabulary, the tool recognition and primer, and the local-host route. Plan 13 adds the remote-hosted loop's route.

## Goal

`file write` and `file edit` join the native command vocabulary, appear as ordinary rows in the Roles command picker and the Commands table, and run as workspace tools in a local core ACP prompt when the selected role grants them and the effective command settings allow them, with no approval prompt.

## Design decisions and dependencies

- Source plan decision: append `file write` and `file edit` to `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts`. `src/application-commands.ts` already derives native rows with parent `file` and `nativeTool: 'file'` from that list, and the Roles payload already publishes it as `nativeCommands`, so no new UI registry, tool-owner union, panel, key binding, or client code is needed. Existing saved roles are not migrated, and nothing grants the new names in this plan.
- Extend the existing file entry in `createAcpToolTable` rather than adding an owner. Its `match` and `runsOn: 'workspace'` stay. Its `isCommandLine` recognizes read lines and plan 2's mutation lines, including a write/edit prefix with invalid JSON, so a malformed request is gated and answered with usage instead of being displayed as the final answer. Its primer is composed from the grants: the read primer when `file read` is granted, plan 2's mutation primer when `file write` or `file edit` is granted. The allow-list line keeps listing only granted, agent-accessible commands.
- Gate behavior is unchanged and snapshot-based: a disabled or agent-inaccessible row refuses with `Command is disabled: <name>.`, an ungranted command refuses with `Command not allowed for role "<role>": <name>.`, the eight-step cap and `withoutTools` behave as today, and granting a mutation does not re-enable any harness built-in tool.
- In `src/acp/run-prompt.ts`, `host.runWorkspace` sends mutation lines to plan 11's tab runner and keeps sending everything else to `readFileInTab`, after the existing active-prompt check.
- Cancellation: the existing abort guards keep suppressing late results and turns. They cannot undo a mutation that already committed, and nothing retries one.
- No approval question, approval setting, or waiting state is added; refusal comes only from grants and settings.
- Recording behavior is unchanged: transcript entries from `src/acp/run-prompt.ts` and records from `src/acp-records/store.ts` may contain the mutation command text.
- Intermediate state until plan 13 lands: a remote-hosted loop that is granted a mutation gets the read usage line back from its reader, which is safe (nothing is written) and is fixed by plan 13.

## What already exists (reuse, don't rebuild)

| Existing code | Use |
| --- | --- |
| `src/acp/tool-table.ts` `createAcpToolTable`, `gateCommand`, `toolExtractor`, `toolPrimer` | Tool entry, gate, extraction, primer |
| `src/acp/drive-loop.ts` `driveToolLoop`, `corePrimer`, `CORE_MAX_STEPS` | Loop driver |
| `src/acp/native-commands.ts` `nativeCommandName`, `nativeCommandTool` | Vocabulary resolution, which gains the new names for free |
| `src/application-commands.ts` native rows | Commands table and settings rows |
| `web/src/plugins/roles/`, `web/src/plugins/commands/` | Existing data-driven picker and table |
| `src/file-write/tab-write.ts` (plan 11) | Tab runner |

## Proposed changes

Append the two names to `NATIVE_ACP_COMMANDS`. Extend the file tool entry's primer and recognition. Route mutations in `run-prompt.ts`'s `runWorkspace`. Update existing tests that enumerate the vocabulary.

Update `product/specs/acp.md` (the tools, primer, gate, local routing, output lines, no approval prompt, recordings unchanged) and `product/specs/application-commands.md` (the two native rows under `file`, their Enabled and Agent access settings, and inheritance from `file`).

## Tests

- `src/acp/tool-table.test.ts`: the file tool appears for any file grant; the primer includes mutation text only when a mutation is granted; extraction finds a trailing `file write {…}` and a malformed `file edit {`; the gate refuses an ungranted mutation, a disabled `file write` row, and an agent-inaccessible `file edit` row, and routes a granted one to the workspace.
- `src/acp/drive-loop.test.ts`: a granted write runs through `runWorkspace` and its one-line result is fed back; `withoutTools` exposes no file tools; the step cap still applies.
- `src/acp/run-prompt.test.ts`: a local tab's mutation runs through the tab runner and changes the file; a read still goes to `readFileInTab`; no question is opened; cancellation suppresses a late result.
- `src/application-commands.test.ts`, `src/acp/native-commands.test.ts`, `src/native-commands/policy.test.ts`: new rows with parent `file`; disabling `file write` disables only that row; disabling `file` covers both; a disabled `file write` also refuses the typed command through ordinary dispatch.
- `web/src/plugins/roles/RolesTab.test.tsx` and `web/src/plugins/commands/CommandsTab.test.tsx`: the new names appear as ordinary entries with the existing controls, accessible names such as `Command to add to role <name>` and `Remove file write`, and restriction indicators. No browser harness is added.
- Keep `src/acp/ask-role.test.ts` and `src/plugins/roles/roles-file.test.ts` green.

## Verification

Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- The remote-hosted loop route (plan 13).
- Built-in `tell` default grants (plan 14).
- Autonomous agent write integration (refused by plan 3).
- New ACP methods, approval prompts, or re-enabling harness-native write tools.
