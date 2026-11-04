# Remove the stale ACP panel reference from the transcript spec

**Complexity: 1/10** — one prose correction in a behavior spec, with no runtime, test, or documentation change.

## Goal

`product/specs/transcript.md` still says the core ACP panel reuses `flattenBuffer` for its response slice and scopes expansion to its owning plugin tab. API v3 removed that panel, the shell now shows only a settled Markdown reply, and connection-tab history renders separately. The spec must describe the retained shared tool-step collapse without reintroducing the removed panel.

## Approach

Replace only the final sentence of the "Collapsed ACP tool steps" paragraph. Keep the `flattenBuffer(log, collapseToolSteps)` description, the summary-line wording, the run/absorption rules, the visible prompt and final answer, and the `[[acp]]` link. State that shell and agent transcript entries retain the per-tab `Tab.toolStepsExpanded` collapse, and that connection-tab thought and tool entries use their own expandable rendering rather than a panel response slice.

The corrected wording agrees with `product/specs/acp.md` ("There is no ACP plugin or client response hook", "The shell shows only the settled answer", "shared tool-step collapse remain available without a response panel"), `product/specs/keyboard-navigation.md` (`Ctrl+T` toggles the current tab's shared transcript tool-step collapse state; no response panel is required), `product/specs/connections-tab.md` (thought and tool entries start collapsed), and `web/src/shared/transcript/transcript-line.tsx` (collapsed, ACP prompt, and ACP output lines toggle through the shared transcript control).

## Implementation steps

1. Edit the final two sentences of the paragraph in `product/specs/transcript.md` so the panel claim becomes the retained per-tab collapse plus the connection tab's separate expandable rendering.
2. Cross-check the corrected paragraph against `product/specs/acp.md`, `product/specs/keyboard-navigation.md`, `product/specs/connections-tab.md`, and `web/src/shared/transcript/transcript-line.tsx`.
3. Run `$janissary/scripts/run.mjs check-diff`; a Markdown-only change selects no source lint, typecheck, or test job.
4. Promote this plan to `product/plans/complete/` and remove only the resolved entry from `product/backlog/pull-request.md`, preserving the remaining entries byte-for-byte.

## Tests

None — no behavior or code changes. The existing `src/tab/index.test.ts` collapse cases and the shared transcript rendering tests continue to pin the described behavior unchanged.

## Out of scope

- Source, tests, CSS, or protocol changes.
- `product/specs/acp.md`, `product/specs/keyboard-navigation.md`, `product/specs/connections-tab.md`, and other specs, which already describe the panel-free behavior correctly.
- `help/` and `documentation/user-documentation/`, which already describe the shell answer and connection-tab activity without a panel.
- The pull request's title and body, and any other backlog entry.
- Merging, closing, or rewriting the pull request's history.
