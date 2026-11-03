# Shell replies and connection popup integration

**Complexity: 4/10**

## Goal

Make shell ACP prompts asynchronous, render their settled replies at the shell output bottom, and make ACP/agent rows in each tab's connections popup open the corresponding connection tab.

## Decisions and dependencies

- Covers source-plan requirements 3–4, 9–10, 20, 31, 35, 37, and tests for shell replies and popup row callbacks.
- Depends on ACP cancel/feed subplan 02 for settled outcomes and record ids, plus plugin subplan 04 for opening/focusing a connection tab. Can proceed after both are complete; it does not require API-v3 panel removal.
- Every shell `acp` invocation settles exactly one background reply: answer, second-prompt refusal, usage, ACP error, reset/close result, or cancellation. The echoed line is `acp <prompt>` (or the actual typed usage line) and is rendered Markdown. Monitor replies retain their existing `monitor` line.
- Preserve `acpEntries` tagging because the transcript settlement path still uses it. Popup ACP snapshot buttons remain wherever already available; opening a row is a distinct callback and applies only to a record id or a tab-scoped ACP reference.

## Existing code to reuse

- `backgroundReplies`, `onBackgroundReply`, and `useBackgroundReplies`; shell Markdown `displayReply` in `web/src/plugins/shell/useShellSubmit.ts`.
- `settleAcpPrompt` in `src/acp/response.ts`, and existing popup rows in `StatusPanels`/`ShellTabMeta` plus editor and harness popup integrations.
- Plugin open/focus intent route established by subplan 04.

## Proposed changes

- Have `src/commands/acp.ts` start `promptResult` without awaiting and append a background log entry when it settles, with `input` set to the echoed `acp <prompt>`, `output` set to settled text, and a fresh UUID in `background`. Keep `coreResponse: true` so submission does not render an immediate duplicate.
- Add optional `line` to `ConnectionView` in `src/protocol/tab.ts`; project it only for ACP background entries from `entry.input`, extracting the projection to `src/tab/background-replies.ts` if the size limit requires it. Pass `reply.line ?? 'monitor'` to shell rendering.
- Extend `StatusPanels` with optional `onOpenRow(row)`, called for a row with `recordId` or tab-scoped `acpRef`. Pass it from shell, editor, and harness metadata surfaces. Its RPC opens/focuses the record tab for `recordId`, or the owning tab's core connection tab for a tab ACP reference. Preserve snapshot action behavior.
- Include a running agent run in its caller popup as an ACP-kind row titled `Agent: <task filename>`, carrying `recordId` but no `acpRef` and therefore no transcript snapshot button.

## Tests

- Extend `src/tab/view.test.ts` and shell background-reply tests: ACP line is projected, monitor has no line, and existing monitor display remains `monitor`.
- Extend `web/src/shared/status-windows/` tests for callbacks on record-id and tab ACP-ref rows only.
- Extend shell tests for asynchronous Markdown answer with echoed input, refusal/cancel/error output exactly once, and popup opening. Add editor/harness popup regression coverage if their callback wiring has distinct paths.

## Verification

- Run diff-scoped checks for server and web changes.
- Manually confirm a shell remains usable while ACP is in flight, answer appears at current bottom, and clicking its popup ACP row opens the connection tab in shell, editor, and harness contexts.

## Out of scope

- Removing the streaming response panel and changing plugin API version (subplan 06).
- Connections plugin rendering/command implementation (subplan 04), ACP record model, remote cancel, and documentation.
