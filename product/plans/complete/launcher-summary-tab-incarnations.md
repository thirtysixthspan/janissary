# Reject launcher summaries from old tab incarnations

**Complexity: 7/10** — summary state spans the launcher's singleton lifecycle and asynchronous ACP work, while tab labels can be reused before a reply arrives.

## Goal

Closing and reopening the launcher starts with fresh summary state. A reply from an older launcher or tab incarnation never updates the current launcher payload, and summaries for disappeared tabs are pruned promptly.

## Approach

Give each tab object a stable identity exposed through `TabActivityEntry`. Store summary and cursor ownership against that identity as well as the visible label. After an awaited ACP prompt, re-read current tab activity and accept a reply only for labels that still name the same incarnation. Reset module state inside the singleton tab's creation factory, the point that runs on ordinary close and reopen.

## Implementation steps

1. Add a stable per-tab incarnation identity to the host activity contract and populate it from a host-owned identity map.
2. Bind summarizer cursors to incarnation identities, prune identities that disappear, and filter replies against a fresh post-prompt activity read.
3. Keep summary ownership identities beside launcher summaries, prune stale summaries on tab topic delivery, and reset launcher and summarizer state when a new singleton tab is created.
4. Add regression tests for reused labels during a deferred reply and for close/reopen through the tab plugin host lifecycle.
5. Update the launcher functional spec to describe summaries as belonging to the current tab incarnation.

## Tests

- `src/plugins/activity.test.ts`: activity reads expose a stable identity for the same open tab and a different identity for a new tab reusing its label.
- `src/plugins/launcher/summarizer.test.ts`: a deferred reply for a closed tab is dropped when a new incarnation reuses its label; its cursor is not advanced for the replacement.
- `src/plugins/launcher/activate.test.ts` or a host-backed launcher integration test: closing and reopening the singleton clears summaries and cursors through ordinary `TabManager` closure, without manually calling activation disposal.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Spec updates

- `product/specs/launcher.md`: clarify that summaries and in-flight replies belong to the current tab incarnation and are discarded when that incarnation closes.

## Out of scope

- Changing summary cadence, prompt framing, reply format, or the launcher payload's user-visible shape.
- Repairing the separate review-fixture backlog entry on this branch.
- Updating `help.md` or user documentation, which do not document summary lifecycle internals.
