# Correct verify step 7's stale editor connection model claim

**Complexity: 1/10** — description-only correction to one Expect line (~0 added production lines, 0 files, 1 requirement, p=2.07); no source, test, spec, help, or user-doc edits.

## Goal

Correct PR 2170's "How to verify" step 7 so it no longer claims the editor persona's connection reports a model id (`claude:claude-haiku-4-5`). The editor connections window renders a plain-text row `<persona> (acp)` with no model id, so a verifier following the step today looks for model text that cannot appear there. The corrected line keeps the meaningful assertions (the request runs on the same `research` role, and surrounding spaces/different case do not produce an unknown-role notification) and redirects any model check to the monitor connection-info line in `src/monitor/session.ts` or to the connection record — exactly as verify steps 1 and 2 and the Screenshots section already do.

## Approach

This is a pull-request-description correction, not a code change. The recorded backlog entry is resolved by:

1. Fixing the PR body live on GitHub (Step 8.5) — change only step 7's `Expect:` line, preserving every other character of the body including the title and the "Additional test cases" section.
2. Recording the fix plan in `product/plans/complete/` and draining the resolved backlog entry (restoring the master skeleton), which are the file changes the commit publishes to the PR branch.

No source, test, spec, help, or user documentation file is edited. The existing test that pins the editor row text must keep passing unchanged.

## Implementation steps

1. Confirm the row shape the code actually produces:
   - `connectionsFor` in `src/editor/acp-manager.ts` builds the row text `${persona} (acp)` with `kind: 'acp'` and `acpRef: { scope: 'editor', label, persona }` — no model id.
   - `src/connection/catalog.ts` carries that text through as the connection entry's `display`.
   - `web/src/shared/status-windows/StatusPanels.tsx` renders `row.text` as plain text — no model id.
   - `src/editor/acp-manager.test.ts` pins `reviewer (acp)` and must keep passing.
2. Write the plan to `product/plans/draft/`, rate it, and move it to `product/plans/ready/`, then to `product/plans/complete/` on publication.
3. Remove the resolved entry from `product/backlog/pull-request.md`; because it is the only entry, restore the file to the exact master comment-and-heading skeleton.
4. Commit and push to `feature/persona-role-acp-pipeline`, leaving PR 2170 open.
5. After the push, read the body with `gh pr view 2170 --json body`, change ONLY step 7's `Expect:` line, write the full body to `./temp/pr-body.md`, and apply with `gh pr edit 2170 --body-file ./temp/pr-body.md`.

The new step 7 `Expect:` line reads:

```
   Expect: the request runs on the same `research` role; the surrounding spaces and different case do not create an unknown-role notification. The configured model is a server-side fact with no control in the web UI: confirm it from the monitor connection-info line in `src/monitor/session.ts` or from the connection record, not from the editor persona's plain-text connection row.
```

## Tests

None new — this is a description-only correction. The existing `src/editor/acp-manager.test.ts` coverage that pins the `<persona> (acp)` row text must remain green and is verified by `check-diff`.

## Out of scope

- Any source, test, spec, help-page, or user-documentation edit.
- Changing the PR title, any other verification step, the Screenshots section, or the "Additional test cases" section.
- Adding change-set statistics (commit/file/line counts, SHAs) to the corrected line.
- Merging, closing, or replacing the PR.
