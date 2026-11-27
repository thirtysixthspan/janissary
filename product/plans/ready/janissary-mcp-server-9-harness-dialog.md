# feat: add the MCP server checkbox to the New harness dialog

**Complexity: 2/10** — ~25 added lines, 3 edited files, 2 requirements (p=4.27)

## Goal

Let the New harness dialog opt out of MCP with a checkbox that sits after **E2E browser**, is checked by default, and is cleared and disabled by **Offline**. Unchecking it adds `--no-mcp` to the built command, which the parser from an earlier subplan already accepts. This is a web-only change over the existing dialog state machine.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on `janissary-mcp-server-6-harness-launch-args.md`.

## Requirements

1. The New harness dialog gains an **MCP server** checkbox after **E2E browser**, checked by default; unchecking it adds `--no-mcp` to the built command — user scope extra: "New harness dialog toggle"; user answer: "Checked; off+disabled w/ Offline".
2. Checking **Offline** clears and disables **MCP server**, and unchecking **Offline** re-enables it, following the Auto-resume enable rule — user answer: "Checking **Offline** clears and disables it, and unchecking Offline re-enables it".

## Design decisions

- The `mcp` field is a dialog-only boolean in `HarnessLaunchFields`, initially true. It is not a wire type and needs no catalog support: every harness accepts MCP.
- `nextFields` applies the enable rule beside `autoResumeSupported`: when `offline` is true it sets `mcp` false and the dialog marks the control disabled; when `offline` clears it re-enables the control, following the existing `autoResumeEnabled` pattern rather than a new one.
- `buildHarnessLaunchCommand` appends `--no-mcp` only when `mcp` is false and `offline` is false: an offline launch already carries no MCP config, so a redundant flag would be noise.

## Preserved behavior

None found.

## Assumptions

1. The dialog's field state and enable rules are pure functions in `harness-launch-selection.ts` — `web/src/harness/harness-launch-selection.ts:29` `export function nextFields(`.
2. The Auto-resume enable rule is the pattern to copy — `web/src/harness/harness-launch-selection.ts:38` `if (!autoResumeSupported(view, next.name)) next.autoResume = false;`.
3. The command is assembled from field values in `buildHarnessLaunchCommand` — `web/src/harness/harness-launch-command.ts:27` `export function buildHarnessLaunchCommand(fields: HarnessLaunchFields): string`.
4. The dialog renders the E2E browser checkbox directly after Offline — `web/src/harness/HarnessLaunchDialog.tsx:81` `E2E browser (-b)`.
5. The server already parses `--no-mcp` — `src/harness/command-parse.ts` (added by `janissary-mcp-server-6-harness-launch-args.md`).

## Existing functionality

1. The dialog state machine and initial fields — `web/src/harness/harness-launch-selection.ts:15` `export function initialFields(`.
2. Field patching with enable rules — `web/src/harness/harness-launch-selection.ts:29` `nextFields(`.
3. Dialog-to-command assembly — `web/src/harness/harness-launch-command.ts:27` `buildHarnessLaunchCommand`.
4. The New harness dialog form, including its checkbox rendering — `web/src/harness/HarnessLaunchDialog.tsx:60` `<div className="harness-launch-form">`.

## Implementation steps

1. Add `mcp: boolean` to `HarnessLaunchFields` in `web/src/harness/harness-launch-command.ts` and set it to `true` in `initialFields` (`web/src/harness/harness-launch-selection.ts:15`). In `nextFields` (`web/src/harness/harness-launch-selection.ts:29`), set `mcp` false when `offline` is true and restore the previous enable state when offline clears, following the Auto-resume rule. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. In `buildHarnessLaunchCommand` (`web/src/harness/harness-launch-command.ts:27`), append `--no-mcp` when `mcp` is false and `offline` is false. Build and check with `$janissary/scripts/run.mjs check-diff`.
3. In `web/src/harness/HarnessLaunchDialog.tsx`, render an **MCP server (--no-mcp to disable)** checkbox directly after the **E2E browser (-b)** label (`web/src/harness/HarnessLaunchDialog.tsx:81`), with the same `harness-launch-check` and disabled-class pattern as Auto-resume. Update `product/specs/harness.md` with the dialog checkbox. Build and check with `$janissary/scripts/run.mjs check-diff`.

Every touched file stays under the 200-line `max-lines` limit. Web files follow the feature-directory and direct-import rules in `ai/guidelines/react-code-organization.md`.

## UI design

1. The **MCP server (--no-mcp to disable)** checkbox sits directly after **E2E browser (-b)** in the New harness dialog form, checked by default.
2. Checking **Offline** clears and disables it, with the same dimmed-label treatment as **Auto-resume**; unchecking **Offline** re-enables it.
3. No new layout, color or key binding is introduced.

## Tests

- `web/src/harness/HarnessLaunchDialog.test.tsx`: **MCP server** starts checked, unchecking it adds `--no-mcp` to the submitted command, checking **Offline** clears and disables it, and unchecking **Offline** re-enables it (requirements 1, 2).
- `web/src/harness/harness-launch-command.test.ts`: extend the `fields()` fixture with `mcp: true` when the new required field is added to `HarnessLaunchFields`, and assert the `--no-mcp` append case beside the existing flag cases.

## Out of scope

- Server-side parsing of `--no-mcp`: `janissary-mcp-server-6-harness-launch-args.md`.
- The metadata flag shown once a harness uses MCP: `janissary-mcp-server-8-metadata-flag-and-focus.md`.
- Adding any per-harness catalog gating for MCP.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then open the New harness dialog, confirm **MCP server** is checked, uncheck it and confirm the command preview contains `--no-mcp`; check **Offline** and confirm the MCP checkbox clears and dims, then uncheck Offline and confirm it re-enables. A failure is a disabled checkbox that still submits `--no-mcp`, or a command that never changes.
