# Codex harness auto-approve detection

**Complexity: 3/10** — one security-sensitive pure detector plus small server, profile, and dialog capability changes; no new state machine, protocol, persistence, or notification behavior.

## Summary

Extend the existing harness auto-approve mechanism to recognize and answer Codex permission prompts. This is a narrow per-harness addition: a new Codex module owns only prompt detection and the approval input, while the existing `HarnessAutoApprover` continues to own injection, repeated-prompt suppression, notifications, capture links, stand-down behavior, lifecycle, and warning behavior.

Users can opt in through `harness codex -y`, the **New harness** dialog, or a Codex profile entry with `autoApprove: true`. Claude behavior remains unchanged and OpenCode remains unsupported.

## Design decisions

1. **Add Codex detection, not a second auto-approve implementation.** The new `src/harness/codex-permission-gate.ts` module exports a pure `detectCodexPermissionGate(text)` matcher and `CODEX_APPROVAL_KEYSTROKE`. It contains no PTY, notification, capture, or lifecycle state. `HarnessAutoApprover` at `src/harness/auto-approve.ts:77` remains the only stateful approver.

2. **Recognize Codex's approval overlay structurally.** Ground truth is Codex CLI 0.144.4 and its `ApprovalOverlay`: command execution, network access, file changes, permission grants, and MCP elicitation render a list-selection overlay with a request-specific title, a highlighted first ordinary-approval option, and the confirm/cancel footer. The detector requires all three parts in order instead of matching broad words such as “allow,” “approve,” or “yes.”

3. **Approve only the highlighted one-time/ordinary choice.** `CODEX_APPROVAL_KEYSTROKE` is carriage return (`\r`). The detector requires the selection marker on option 1 before Enter is sent. This accepts `Yes, proceed`, `Yes, just this once`, the per-turn permission grant, or the first MCP approval action. It never selects Codex's persistent prefix, session, host, or file allowlist choices. A literal `y` is not used because Enter follows the visible selected-row contract rather than a request-specific shortcut.

4. **Reject stale approval-shaped transcript content.** After finding the selected first option and confirm/cancel footer, reject the capture if a later live Codex composer line appears. This mirrors Claude's stale-gate defense at `src/harness/auto-approve.ts:21` (`isInputCaretLine`) and prevents a quoted or previously resolved menu above Codex's current input prompt from receiving an injected Enter.

5. **Reuse all existing safety and audit behavior exactly.** `HarnessAutoApprover.onCapture` at `src/harness/auto-approve.ts:94` injects once, immediately records `Auto-approved a permission prompt`, and passes the capture to the existing notification path. That notification means an approval input was sent, not that Codex later proved the gate cleared. If the same gate redraws byte-for-byte, the shared approver does not inject again and emits `Auto-approve could not clear the permission prompt; standing down` once. An unchanged quiet gate is not recaptured by `HarnessScreenReader` (`src/harness/screen.ts:18`, “an unchanged screen is never re-captured”), so stand-down notification remains best-effort on redraw, as it is for Claude.

6. **Derive server-side support from the detector table.** Export `supportsHarnessAutoApprove(harnessName)` from `src/harness/auto-approve.ts`, returning whether `GATE_TABLE` at `src/harness/auto-approve.ts:53` has an entry. Both command parsing and profile launching use this predicate, so accepted harnesses cannot drift from installed detectors. This creates no import cycle: `auto-approve.ts` does not import `harness/index.ts`, while the existing `command-parse.ts` → `index.ts` dependency remains unchanged.

7. **`-y`/`--yes` supports Claude and Codex and still rejects OpenCode.** Both supported harnesses work with or without `-w`. `harness opencode -y` remains a hard error with `-y/--yes is only supported for the claude and codex harnesses.`

8. **The dialog keeps the Auto-approve name.** The checkbox is enabled for Claude and Codex, disabled for OpenCode, and labeled `Auto-approve (-y) — claude and codex only`. Switching between Claude and Codex preserves its checked state. Switching to OpenCode clears it before disabling the control, so remembered dialog state cannot later emit an invalid command.

9. **Profiles expose the same supported set.** A Codex harness entry with `autoApprove: true` launches with the shared approver armed. An OpenCode entry remains a semantic launch-time skip with `autoApprove (-y) is only supported for the claude and codex harnesses`. Profile schema and save/load shapes already accept the boolean and do not change.

10. **No wire or persistence changes are needed.** The existing `autoApprove` tab field, launch-dialog command builder, screen-reader callback, notification event, capture path, and profile shapes already carry the feature. OpenCode, custom Codex approval keymaps, and global bypass/full-auto launch flags remain out of scope.

## Codex detection ground truth

The detector covers these Codex 0.144.4 approval-overlay families:

| Request family | Required title anchor | Required selected first-option anchor |
|---|---|---|
| Command execution | exact line `Would you like to run the following command?` | selected option 1 beginning `Yes, proceed` |
| Network access | line beginning `Do you want to approve network access to "` and ending `"?` | selected option 1 beginning `Yes, just this once` |
| File changes | exact line `Would you like to make the following edits?` | selected option 1 beginning `Yes, proceed` |
| Permission request | exact line `Would you like to grant these permissions?` | selected option 1 beginning `Yes, grant these permissions for this turn` |
| MCP elicitation | line ending ` needs your approval.` | selected option 1 from the captured ordinary approval action |

Every positive match also requires a later footer containing both `to confirm` and `to cancel`. Match trimmed rendered lines with `startsWith`/`endsWith` checks rather than a broad regular expression, keeping variable commands, hosts, reasons, paths, server names, wrapped details, and optional extra choices out of the signature. Capture one real fixture for each family before finalizing its first-option text; if Codex 0.144.4 cannot surface a family locally, omit that family from the initial detector rather than guessing and record the omission in `product/specs/harness.md`.

Copy the selected-row glyph from the real `HarnessScreenReader` text capture rather than assuming it from a screenshot. Current Codex examples render `› 1.`, while Claude uses `❯ 1.`; the fixture is authoritative because `@xterm/headless` translation at `src/harness/screen.ts:66` is the exact production input to the matcher.

## What already exists (reuse, don't rebuild)

| Existing piece | Verified location | How it is reused |
|---|---|---|
| Stateful one-shot/stuck loop | `src/harness/auto-approve.ts:77` (`HarnessAutoApprover`) | Receives Codex captures and uses the Codex table entry without behavioral changes. |
| Per-harness detector/input registry | `src/harness/auto-approve.ts:47` (`GateEntry`) and `src/harness/auto-approve.ts:53` (`GATE_TABLE`) | Gains one `codex` entry and becomes the source of truth for support validation. |
| Rendered terminal capture | `src/harness/screen.ts:30` (`HarnessScreenReader` constructor) and `src/harness/screen.ts:66` (`captureNow`) | Already delivers settled, de-ANSI'd screen text through `onCapture`. |
| Launch and capture wiring | `src/harness/manager.ts:225` (`captureHandler`) and `src/harness/manager.ts:239` (`buildAutoApprover`) | Already creates the shared approver for any accepted harness with `autoApprove` enabled. No manager source change is required. |
| Audit capture and notification | `src/harness/manager.ts:244` (`notify` callback), `src/harness/capture-file.ts:17` (`writeCaptureFile`), and `src/notifications.ts:72` (`notify`) | Records Codex injections and links captures under the existing drop-if-notifications-closed behavior. |
| Permission-gate busy priority | `src/harness/busy-status.ts:29` (`busyStatusHandler`) and `src/harness/busy-status.ts:36` (`detectPermissionGate`) | Codex already has a `BUSY_TABLE` entry, so a recognized gate immediately clears busy and marks unread only when no approver can handle it or the approver stood down. |
| Command flag plumbing | `src/harness/command-parse.ts:42` (`autoApprove`) and `src/harness/manager.ts:69` (`open`) | Already carries `-y` through launch; only supported-name validation and comments change. |
| Profile plumbing | `src/profile/entry-openers.ts:23` (`openHarnessEntry`), `src/profile/save-entries.ts:22` (`writeHarnessEntry`), and `src/types.ts:258` (`ProfileHarnessEntry`) | Already loads, saves, and launches `autoApprove`; only semantic validation and Claude-only comments change. |
| Dialog command construction | `web/src/HarnessLaunchDialog.tsx:31` (`autoApproveEnabled`) and `web/src/harness-launch-command.ts:20` (`buildHarnessLaunchCommand`) | The builder already emits `-y`; only dialog capability logic and visible wording change. |

## Proposed changes

1. **Add `src/harness/codex-permission-gate.ts`.** Export `detectCodexPermissionGate(text)` and `CODEX_APPROVAL_KEYSTROKE`. Implement the exact title → selected option 1 → confirm/cancel footer ordering above, plus the no-later-live-composer rule. Keep this module pure and below the 200-line source limit. Use a relative `.js` extension when importing it from server TypeScript.

2. **Register Codex in `src/harness/auto-approve.ts`.** Import the new exports, add the `codex` `GATE_TABLE` entry beside `claude` at line 54, update the table comment at line 49, and export `supportsHarnessAutoApprove` from table membership. Leave `HarnessAutoApprover`, its fallback keystroke, messages, capture handoff, and state fields unchanged.

3. **Widen command validation in `src/harness/command-parse.ts`.** At line 45, replace `name !== 'claude'` with `!supportsHarnessAutoApprove(name)` and update the exact OpenCode error. Update the Claude-only comments at lines 43 and 63. The parsed shape and downstream launch arguments do not change.

4. **Widen profile validation and its type comment.** At `src/profile/entry-openers.ts:32`, use the same predicate and updated exact semantic-skip message. Update `ProfileHarnessEntry.autoApprove` documentation at `src/types.ts:272` to say Claude and Codex are supported and OpenCode is skipped. Do not change `src/profile-schema.ts`, `src/profile/save-entries.ts`, or the profile file format.

5. **Enable Codex in `web/src/HarnessLaunchDialog.tsx`.** Replace the Claude-only checks at lines 31 and 37 with one local supported-name helper used by both enablement and clearing logic. Change the label at line 75 to `Auto-approve (-y) — claude and codex only`. Keep `web/src/harness-launch-command.ts` unchanged.

6. **Update behavior specs and documentation.** In `product/specs/harness.md:32`, describe the dialog as supporting Claude and Codex; in its auto-approve section at line 101, document the Codex anchors, ordinary Enter action, exact OpenCode error, and immediate gate-aware busy/unread behavior, replacing the future-work text at lines 268–271. Update all three non-Claude semantic-check references in `product/specs/profiles.md:14`, `product/specs/profiles.md:30`, and `product/specs/profiles.md:79`. Update the harness row at `help.md:27` and the dialog/auto-approve prose at `documentation/user-documentation/advanced-agents/harness.md:44` and line 73. `product/specs/tabs.md` needs no change because its auto-permitting flag description is already harness-neutral.

7. **Refresh the affected documentation screenshot.** The dialog's visible label changes, and `documentation/user-documentation/advanced-agents/harness.md:42` embeds `documentation/public/screenshots/harness-launch-dialog.png`. After building the web bundle, regenerate only that shot through `./scripts/run.mjs docs-screenshots harness-launch-dialog`, following `scripts/docs-screenshots.mjs:1`; do this on a host with Playwright Chromium available.

## Implementation order

1. Capture Codex 0.144.4 approval overlays through the existing `harness capture <label>` path and pin the exact selected-row glyph/text and live-composer negative in fixtures.
2. Add and unit-test the pure Codex detector/input module.
3. Register the detector and add the shared support predicate.
4. Widen server command and profile validation, then their tests.
5. Widen the dialog capability and tests.
6. Update specs, user documentation, and the dialog screenshot.
7. Run diff-scoped verification and perform the manual end-to-end checks.

## Tests

- Add `src/harness/codex-permission-gate.test.ts` with a positive rendered-screen fixture for every locally verified request family and negative fixtures for ordinary output, a title without a menu, a menu without the confirm/cancel footer, a non-highlighted first option, persistent-choice text without the active overlay, a resolved gate followed by Codex's live composer, and quoted gate-shaped output. Assert `CODEX_APPROVAL_KEYSTROKE` is carriage return.
- Extend `src/harness/auto-approve.test.ts:149` so Codex is no longer classified as unarmed, `detectPermissionGate` routes Codex only to the Codex matcher, OpenCode still returns false, and a Codex-shaped gate does not match Claude. Add one Codex `HarnessAutoApprover` case proving the table-selected input is injected; do not duplicate the existing generic notification, reset, repeat suppression, and stand-down tests at lines 159–218.
- Extend `src/harness/index.test.ts:109` with `harness codex -y` and `harness codex --yes`, retain both OpenCode rejection cases at lines 130–139, and assert the updated exact error. Existing Claude combinations remain regression coverage.
- Extend `src/harness/manager.test.ts:207` with one Codex integration case that launches `harness codex -y`, sends a Codex gate through the real screen-reader delay, and observes the existing PTY input/notification path. Reuse the existing Claude capture-link, disabled-mode, profile-threading, and stand-down tests rather than cloning each for Codex.
- Extend `src/profile/agent-opener.test.ts:114` with semantic launch cases proving a Codex `autoApprove: true` entry reaches `openFromProfile` and an OpenCode entry is skipped with the exact updated message. No save/load test is needed because `writeHarnessEntry` at `src/profile/save-entries.ts:22` is harness-agnostic and already round-trips `autoApprove` in `src/profile/save.test.ts:69`.
- Extend `web/src/HarnessLaunchDialog.test.tsx:33` to verify the checkbox is enabled for Codex regardless of workspace, remains checked when switching Claude ↔ Codex, clears/disables on OpenCode, renders the new label, and submits `harness codex -y`. Keep `web/src/harness-launch-command.test.ts` unchanged because its subject is harness-agnostic and its `-y` behavior is already covered at line 29.

## Out of scope

- Reimplementing notifications, capture links, repeated-prompt suppression, stand-down handling, warnings, lifecycle cleanup, tab flags, or persistence for Codex.
- Auto-approve support for OpenCode.
- Launching Codex with a global bypass/full-auto flag or selecting a persistent prefix/session/host/file approval choice.
- Supporting user-remapped Codex approval/list keybindings; this integration targets the stock 0.144.4 approval overlay and Enter-to-confirm behavior.
- Guessing at a Codex approval family that cannot be captured and verified locally.
- Adding a new RPC, protocol capability field, notification type, profile field, or persisted state.
- Broad, regex-heavy, image, or model-based permission-prompt classification.

## Open questions

None. The detector's accepted prompt families are limited to locally captured Codex 0.144.4 overlays; uncaptured families are explicitly omitted rather than left for the implementer to guess.

## Verification

- Run `./scripts/run.mjs check-diff`; it must cover the changed server detector/command/profile tests and client dialog tests without running the human-only full `npm run check`.
- Open the notifications tab and manually launch `harness codex -w -y`. Trigger each captured request family and confirm exactly one Enter is injected, the first ordinary approval is chosen, and `Auto-approved a permission prompt` includes a working capture link.
- Force or simulate an identical redraw and confirm no second input is sent, the stand-down notification appears once, and the hidden Codex tab becomes unread through the existing gate-priority path.
- Repeat with `harness codex -y` to confirm the existing no-workspace warning, and launch a Codex profile with `autoApprove: true`.
- In the **New harness** dialog, select Codex and Auto-approve, switch Claude ↔ Codex to confirm the check remains selected, then switch to OpenCode to confirm it clears and disables. Submit Codex and confirm the command is `harness codex -y`.
- Confirm `harness opencode -y` and an OpenCode profile entry with `autoApprove: true` return their updated exact errors and create no harness tab.
- Rebuild the web bundle and regenerate `documentation/public/screenshots/harness-launch-dialog.png`; visually confirm the image contains the new Claude-and-Codex label.
