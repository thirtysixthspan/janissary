# Reload editor content on the first detected external change, not just the second

**Complexity: 3/10** — a one-line initialization bug in an existing hook; no new architecture.

## Goal

After resyncing a git-synced file (or any first external edit to a freshly-opened tab) removes
content from the file, the open editor tab reloads to show the shrunk content immediately, instead
of silently keeping the stale pre-resync text until a second on-disk change happens to come along.

## Root cause

`web/src/editor/useEditorWatchReload.ts` tracks the last `mtimeMs` it has reacted to in
`seenMtimeRef`, initialized to `undefined`. Its effect treats the *first* time it observes a
defined `mtimeMs` as already reflected in the tab's initial content fetch, and skips reloading:

```ts
const seenMtimeRef = useRef<number | undefined>(undefined);
useEffect(() => {
  if (mtimeMs === undefined || mtimeMs === seenMtimeRef.current) return;
  const isFirstSighting = seenMtimeRef.current === undefined;
  seenMtimeRef.current = mtimeMs;
  if (isFirstSighting) return; // <-- swallows the change
  ...
}, [mtimeMs]);
```

That assumption only holds when the component *mounts* with a already-nonzero `mtimeMs` prop
(e.g. a remounted tab whose server-side `tab.editor.mtimeMs` was already set by an earlier
external change — the initial `fetchContent` in `useEditorFile` picks up current disk content
regardless of `mtimeMs`, so that leftover value really is stale-but-harmless at mount).

It does not hold for a tab that mounts with `mtimeMs === undefined` (the common case — see
`src/editor/watch-manager.ts`: `tab.editor.mtimeMs` is only ever set once `EditorWatchManager.check`
observes an on-disk change; it's never populated on tab open). For such a tab, the *first* real
`mtimeMs` value the hook observes — e.g. the mtime bump from a manual resync
(`resyncEditorTab` → `gitSync.openSync()` → `editorWatch.refresh` → `check`) — is a genuine,
unseen-by-the-client change. Treating it as already-reflected means the reload is skipped, and the
buffer keeps showing pre-resync content (including lines the resync just removed) until some
*second* external change eventually arrives.

## Fix

Initialize `seenMtimeRef` with the `mtimeMs` value present on the hook's first render, instead of
hardcoding `undefined`, and drop the separate `isFirstSighting` branch entirely:

```ts
const seenMtimeRef = useRef<number | undefined>(mtimeMs);
useEffect(() => {
  if (mtimeMs === undefined || mtimeMs === seenMtimeRef.current) return;
  seenMtimeRef.current = mtimeMs;
  ... // existing reload logic, unchanged
}, [mtimeMs]);
```

This preserves the original intent (skip a value that was already true at mount, e.g. a remounted
tab) while fixing the bug: a freshly-mounted tab's baseline is `undefined`, so the very first
`mtimeMs` transition — undefined → a real number — now correctly counts as a new external change
and triggers the reload, matching the "second sighting" behavior already covered by
`web/src/EditorTab.test.tsx`'s existing `mtimeMs`-reload tests (which mount with `mtimeMs: 1`
already set, so they're unaffected).

## Implementation steps

1. Edit `web/src/editor/useEditorWatchReload.ts`: change `useRef<number | undefined>(undefined)` to
   `useRef<number | undefined>(mtimeMs)` and delete the `isFirstSighting` local/branch.

## Tests

- **`web/src/EditorTab.test.tsx`** — new case: a tab mounted with `mtimeMs` undefined (the default,
  matching a freshly-opened tab) that then receives its first defined `mtimeMs` (simulating a
  resync/external change) reloads and shows the new (shrunk) content, mirroring the existing
  "reloads clean content from disk when mtimeMs changes on an untouched buffer" test's shape and
  fetch-mock setup but starting from an undefined `mtimeMs`.

## Out of scope

- Any change to `src/editor/watch-manager.ts` or `src/editor/resync.ts` — the server-side mtime
  detection and resync plumbing are already correct; only the client's first-change guard was wrong.
- The dirty-buffer conflict path (`useEditorFile`'s `conflictPendingRef`) — unaffected, still keyed
  off the same `dirty` flag as before.
