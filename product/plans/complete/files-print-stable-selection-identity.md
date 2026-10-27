# Keep printed tree selections with their navigator

**Complexity: 4/10** — the fix changes the client/server selection-reply key and both of its consumers, with focused coverage for tab reordering, a closed target, and profile capture.

## Goal

Ensure `files print` uses only the selection reported for its requested navigator, regardless of tab-strip changes while the client reply is pending. If that navigator closes before the reply arrives, print the tree without selection clauses.

## Approach

Use each navigator's stable tab label as the selection record identity instead of its current numeric position. Keep the label through client collection, the wire reply, and the server's selection map. Resolve profile selections by tab label and, after `files print` waits, use the record only while the original navigator state is still open. Labels already identify navigator operations independently of tab order, so this keeps the change within the existing identity model.

## Implementation steps

1. Change selection records and the client selection registry/hook to publish navigator labels, and validate that reply records carry a string label.
2. Key server selection replies by label, update profile capture to resolve by label, and make `files print` resolve its captured navigator only if that same navigator state remains open after the wait.
3. Add client, wire-decoder, request, manager, and profile regressions for identity propagation, tab reordering, and a navigator closing during a request; retain local-print, remote-tree, profile-save, and joined-request coverage.
4. Update the file-navigator behavior spec with the reorder and closed-tree outcomes. Check help and user documentation, changing them only if they claim affected behavior.

## Tests

- Selection-request tests verify replies are keyed by navigator label and still ignore wrong request ids, timeouts, and joined-request semantics.
- A manager test reorders navigators while a print request is pending and verifies only the target tree's selection appears; another supplies a stale target record after that navigator closes and verifies no selection clauses are printed.
- Client-hook and WebSocket tests verify published labels survive collection and reply; decoder tests reject a missing or non-string label.
- Profile-route coverage verifies a selection follows its navigator label rather than its array position, while existing whole-profile save and local/remote print cases remain green.
- Diff-scoped lint, typecheck, and related server and web tests passed after implementation, tests, spec, and backlog updates.

## Out of scope

- Changing tab reorder behavior or the identity used by unrelated file-navigator RPCs.
- Changing the selection timeout, joined-request behavior, remote-tree behavior, or the `files print` command format.
- Adding new public documentation for behavior that existing help and user docs do not describe.
