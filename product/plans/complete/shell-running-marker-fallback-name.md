# Keep running ACP marker names aligned through model fallback

**Complexity: 4/10** — preserve one dispatch correlation across ACP attempts, expose the active record name through existing tab snapshots, and update the shell marker in place.

## Goal

Keep a running `ask` or `tell` marker's tooltip and accessible name aligned with the connection record that its role reference opens when model fallback creates a new record after the shell was renamed.

## Approach

`runAcpCommand` returns a receipt before an ACP prompt settles. The server will carry that receipt id on each pending model attempt and expose the current record name through a separate pending ACP name projection while the prompt runs. The shell will receive those names through a new optional client subscription and refresh its existing marker while keeping the role reference used by its click handler. Completed replies remain on the existing `onBackgroundReply` subscription. Updates that arrive before the dispatch receipt will be retained until the echo is drawn.

## Implementation steps

1. Carry the dispatch reply id into each pending ACP attempt, set its current connection name when the attempt acquires a record, and include correlated pending names in a separate optional `TabView` projection. Keep completed replies and non-shell ACP prompts unchanged.
2. Add server coverage in `src/acp/plugin-session.test.ts` for a renamed shell whose current model fails and fallback creates a record under the new owner name. Keep coverage for the initial title-or-label fallback and reused-record path.
3. Add an optional `onPendingAcpReplyName` client subscription that exposes the separate projection without changing `onBackgroundReply`'s settled-only behavior, and update `useBackgroundReplies` to route these updates to the marker writer.
4. Update `useShellReplyWriters.ts` to apply pending-name updates to the existing running marker without changing its role or marker identity. Retain an update that arrives before the receipt and discard it when the correlated reply settles.
5. Add client coverage in `web/src/plugins/shell/useShellReplyWriters.test.ts` for updating the running marker name, preserving its role reference, and handling an update that arrives before the receipt. Add a focused `thinking-marker-decoration.test.ts` assertion that the running marker applies the new tooltip and accessible name, and verify pending updates do not consume `replyIds` before settlement.
6. Update `product/specs/shell-tab.md` and the tab-plugin API spec/reference to describe the running marker fallback name and the additive pending-name subscription.
7. Promote this plan and remove only this entry from `product/backlog/pull-request.md`, restoring the exact comment-and-heading skeleton when drained.

## Tests

- `src/acp/plugin-session.test.ts`: a shell renamed after the first attempt gets a pending-name update for the fallback record, while the dispatch receipt id and role stay correlated; title-or-label fallback and normal reused-record behavior remain covered.
- `src/commands/ask.test.ts` and `src/commands/tell.test.ts`: accepted shell dispatches pass their receipt ids to the pending prompt.
- `src/tab/view.test.ts`: the active pending ACP name is projected separately from completed replies.
- `web/src/plugins/background-replies.test.ts`: the optional subscription replays only the bound tab's pending names and releases its listener.
- `web/src/plugins/shell/useShellReplyWriters.test.ts`: the existing marker handle receives a running view with the updated tooltip and accessible name, and its click still uses the original role reference; a name update arriving before the receipt is applied once the marker is created.
- `web/src/plugins/shell/useBackgroundReplies.test.ts`: a pending ACP name update does not claim the shared id, so the corresponding settled reply is still delivered once.
- `web/src/plugins/shell/thinking-marker-decoration.test.ts`: changing the running view name updates the marker's tooltip and accessible name in place.

## Specs and documentation

- `product/specs/shell-tab.md`: describe the running marker name following the active fallback record while its click remains role-based.
- `product/specs/tab-plugins.md` and `documentation/developer-documentation/tab-plugins.md`: document the new optional pending ACP name subscription and retain settled-only semantics for `onBackgroundReply`.
- Help and user documentation describe the marker's action but not its name across fallback, so no public documentation change is needed.

## Verification

`./scripts/run.mjs check-diff` passed lint, typecheck, server tests, and web tests. `git diff --check` passed. Seven new tests cover the server fallback and projection, the optional client subscription, marker updates and accessibility text, pre-receipt caching, and reply-id deduplication across six test files.

## Out of scope

- Changing the role reference or the behavior of the connection opener.
- Changing settled reply links, record ownership, or the marker's visible `Thinking` label.
- Changes to unrelated pull-request work items.
