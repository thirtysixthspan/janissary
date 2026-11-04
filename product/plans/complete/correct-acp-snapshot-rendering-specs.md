# Correct ACP snapshot rendering claims

**Complexity: 2/10**. Three behavior-spec corrections with existing routing and rendering coverage; no runtime change.

## Goal

Resolve PR #1916's recorded finding: "Correct the plan's behavior-spec updates to distinguish plain-text ACP snapshots from rendered Markdown views."

## Approach and evidence

Keep the existing snapshot action distinct from rendered replies. `src/controller/transcript.ts:22` gathers tab, monitor, or editor-persona text and calls `writeCaptureFile`, then `openFile.edit`. `src/tab/transcript/text.ts:7` joins input/output as text without interpreting Markdown. `src/harness/capture/file.ts:17` writes a `.txt` capture. `src/open/file-manager.ts:74` sends the edit route to `openInEditor`, not the Markdown opener. `web/src/editor/EditorTab.tsx:183` mounts `EditorLines`; `web/src/editor/EditorLines.tsx:50` and `web/src/editor/render.tsx:99` display text segments rather than Markdown HTML or link anchors.

The separate shared transcript renderer in `web/src/shared/transcript/transcript-line.tsx:16` parses Markdown and handles anchors through `openTranscriptLink` (`web/src/shared/transcript/open-link.ts:9`). `web/src/plugins/connections/ConnectionHistory.tsx:29` renders answers as Markdown HTML. `web/src/plugins/shell/markdown-block.ts:23` routes HTML reply anchor clicks through the shell's `openLink` capability and `web/src/plugins/plugin-client-capabilities.ts:95` delegates that capability to `openTranscriptLink`. Leave the connection-answer description unchanged and retain the shell-reply route. Correct the specs rather than routing snapshots through that renderer, since new snapshot behavior is not requested.

## Implementation steps

1. Correct only `product/specs/markdown-rendering.md`, `product/specs/embedded-web-page.md`, and `product/specs/shell-tab.md`: remove snapshots from formatted surfaces and clickable web-link routes, state that snapshots open as plain-text editor captures, and compare shell Markdown replies with connection answers/shared rendering. Keep snapshot actions and shared renderer behavior unchanged.
2. Run the existing focused tests and review the prose against the code paths above. Preserve contributor/user documentation reconciliation for subplan 07. Promote this plan to complete and drain only the recorded backlog entry to the exact comment-and-heading skeleton.

Run `$janissary/scripts/run.mjs check-diff` after each checkpoint, including plan preparation and completion. For Markdown-only edits it selects no source lint, typecheck, or related test jobs; focused existing tests provide the executable verification.

## Tests and verification

- Run `npm run test:server -- src/controller/transcript.test.ts` for tab/monitor/editor snapshot routing, capture content, editor dispatch, and empty placeholder.
- Run `npm run test:client -- web/src/editor/EditorTab.test.tsx web/src/shared/transcript/transcript-line.test.tsx web/src/shared/transcript/open-link.test.ts` for plain-text editor coverage, retained Markdown rendering, and web/file link routing.
- Add no tests: this repair changes prose, not behavior. Review `.txt` extension, plain text segment rendering, and connection/shell rendered-link consumers directly because the existing routing tests mock capture writes.
- Verify the final diff contains only the three specs, this completed plan, and `product/backlog/pull-request.md`; run `git diff --check` and confirm the exact empty skeleton.
- Revalidate PR #1916 is open on `feature/connections-tabs` before committing/pushing, then confirm the remote PR head matches the local commit and the working tree is clean.

## Out of scope

Source changes, new tests, snapshot action/format/renderer changes, frozen fixtures, the canonical `product/plans/ready/connections-tabs.md` source plan, historical completed plans, subplan 07's contributor/user docs and guidelines, PR title/body edits, merge, and history rewriting. Reuse the prepared dependencies and do not switch to master or run `npm run check`.

## Completion

- Corrected the three named specs, including limiting the file:line link description to the shared transcript renderer rather than plain-text snapshot captures.
- Existing tests passed: 10 server tests in `src/controller/transcript.test.ts` and 166 client tests across `EditorTab.test.tsx`, `transcript-line.test.tsx`, and `open-link.test.ts`. No new tests or source edits.
- `check-diff` passed after plan preparation and spec edits, selecting no source checks for Markdown-only changes. `git diff --check` passed. Prepared dependencies were reused without installation or lockfile changes.
- No existing help/user-documentation page describes the incorrect snapshot claim. Contributor/user documentation reconciliation remains assigned to subplan 07; no public docs or PR description edit is needed.
