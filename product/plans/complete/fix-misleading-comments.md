# Fix the comments that actively mislead

**Complexity: 2/10** — comment-only changes; behavior untouched.

Three comments described things no longer there: two cited the editor-persona-connections plan under `product/plans/ready/` after it moved to `product/plans/complete/` (`src/editor/acp-manager.ts`, `web/src/editor/useEditorConnections.ts`), and one in `web/src/ws.ts` described a fire-and-forget page-snapshot sync method that no longer follows the comment — page snapshots cross the wire through the plugin intent path (`src/plugins/context.ts`, `src/plugins/page/activate.ts`), not a client sync call.

## Goal

Readers tracing pages or the editor's persona connections find what is there instead of a stale citation.

## Implementation steps

1. Both plan-path citations point to `product/plans/complete/editor-tab-persona-connections.md`, in the citation style `src/editor-suggest/handler.ts` already uses.
2. The orphaned page-snapshot comment above `ws.ts`'s `saveFile` states where page snapshots actually cross the wire today.
3. The confirming grep: `plans/ready/` across `src/` and `web/src/` — now zero hits, and `product/plans/ready/` is empty on disk.

## Tests

Comment-only change; `check-diff` (lint, typecheck, server and web tests) is the gate.

## Spec

None — nothing observable changed.
