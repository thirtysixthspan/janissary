# Confirm ACP thinking marker placement and close the resolved issue

**Complexity: 1/10** — no production code changes; the three requested behaviors already shipped, so the remaining work is verification plus removing the stale backlog line (p=2.56).

## Summary

The backlog issue asks that, when querying an ACP agent from the shell, `Thinking` sit on the next line and stay entirely visible, become a `see thought process` link once the reply settles, and put the ACP response on the line after that link. All three behaviors are already present in master. This plan records the verification and closes the stale issue; it changes no production code.

## Verification of the existing behavior

- `web/src/plugins/shell/thinking-marker-decoration.ts` places the marker at the left edge of the row below the echoed command (`marginLeft: '0px'`, `top: (anchor + 1) * rowHeight`) and hides it when that next row would leave the viewport. It already switches between the `Thinking` label plus spinner and the `see thought process` link.
- `web/src/plugins/shell/markdown-block.ts` accepts a `reserveRow` flag that prefixes the answer's terminal write with one `\r\n`, and `web/src/plugins/shell/write-shell-reply.ts` passes it for every reply that settles a marker into a link. The answer therefore starts one row below the marker, on the line after the link.
- `product/specs/shell-tab.md` describes the marker's own line and the answer one row below it. `help/ask.md`, `help/tell.md`, `documentation/user-documentation/advanced-agents/acp-agent.md`, and `documentation/user-documentation/command-bar/shell.md` already describe the same placement and click behavior.
- The existing tests cover next-line placement, full label visibility, the running-to-link transition, and the reserved row for the answer: `thinking-marker-decoration.test.ts`, `markdown-block.test.ts`, `write-shell-reply.test.ts`, `useShellReplyWriters.test.ts`, and `ShellTab.test.tsx`. All pass.

## Implementation steps

1. Run `$janissary/scripts/run.mjs check-diff` to confirm lint, typecheck, and the affected client tests are green in the current tree.
2. Remove the resolved issue's line from `product/backlog/issues.md`, leaving every other entry untouched.
3. Promote this plan to `product/plans/complete/`.

## Tests

- No new tests. The behavior is already covered by the test files named above; `check-diff` confirms they pass.

## Out of scope

- No source, CSS, spec, help, or user-documentation changes: those were delivered by the two earlier plans and already match the requested behavior.
- No change to the marker's content, click behavior, lifetime, or the answer's Markdown rendering.
