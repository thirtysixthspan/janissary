# Fix synced editor tab loading before its shared workspace is ready

**Complexity: 3/10** — a single-hook change on the client plus a matching test update; no server
changes needed.

## Goal

Opening a git-synced editor tab for the first time (before the shared `git-sync` workspace clone
has finished being provisioned) must show a loading state and then load the file's real content
once the workspace is ready — per `product/specs/editor-tab.md`'s "GitHub syncing" section. Today
it instead loads and commits an empty buffer immediately, then never retries once the workspace
finishes provisioning, so the tab is stuck showing a blank file.

## Root cause

`web/src/EditorTab.tsx`'s content-load effect (`fetchContent` + the `useEffect` at lines 70-85)
fetches `editor.url` immediately on mount, with no regard for `editor.sync`. While the tab is
`sync: 'provisioning'`, `editor.url` points at a file inside the not-yet-cloned shared workspace, so
`GET /open/<id>` (`src/index.ts:73-75`) hits `ENOENT`, swallows it, and responds `200` with an empty
body (this is intentional for genuine new-file tabs — `openInEditor` in `src/openers/editor.ts` —
so that behavior itself is correct and must not change). The client's `fetchContent` sees `r.ok` and
resolves with `''`, so `api.load('', ...)` runs and `state` becomes non-null.

Later, `finishOpenSynced` (`src/open-file-manager.ts:102-116`) awaits the workspace's real
`ready` promise (the same signal `GitSync.openSync` already awaits for every other synced code
path) and flips `tab.editor.sync` to `'synced'`, re-registering a new `editor.url`. This update
reaches the client via the existing `messageBus.emit('state', { type: 'dirty' })` broadcast. The
load effect's dependency array does pick up the changed `editor.url`, but its guard
(`if (api.stateRef.current !== null) return;`) short-circuits it, since `state` is already non-null
from the earlier empty-content load — so the real content is never fetched.

## Approach

Gate the load effect on `editor.sync`, reusing the same `'provisioning'` → `'synced'`/`'error'`
transition the server already produces, instead of adding any new synchronization mechanism:

- While `editor.sync === 'provisioning'`, skip the fetch entirely and leave `state` as `null` (the
  existing `{state && <EditorLines ... />}` render branch already shows no content when `state` is
  null — that blank body, together with the existing provisioning sync icon in `EditorMetaRow`, is
  the tab's loading state; no new loading UI needs to be built).
- Add `editor.sync` to the effect's dependency array. Once `finishOpenSynced` flips `sync` away from
  `'provisioning'`, the effect re-runs; `state` is still `null` (never set while provisioning), so
  the existing `if (api.stateRef.current !== null) return;` guard no longer blocks it, and the real
  fetch proceeds exactly like an ordinary (non-synced) editor tab's first load.
- Non-synced tabs (`editor.sync === undefined`) and already-`'synced'`/`'error'` tabs on mount are
  unaffected — the new gate only ever suppresses the very first fetch while provisioning is
  in flight.

No server-side change is needed or in scope: `src/index.ts`'s empty-200-for-missing-file behavior
is relied on elsewhere for legitimate new-file tabs and must be left alone.

## Implementation steps

1. **`web/src/EditorTab.tsx`** — in the content-load `useEffect` (around line 70), add a guard
   `if (editor.sync === 'provisioning') return;` before the existing `stateRef.current !== null`
   check, and add `editor.sync` to the dependency array.

## Tests

- **`web/src/EditorTab.test.tsx`**:
  - Update the existing "renders the provisioning sync status icon for a synced tab not yet filled
    in" test: it currently renders via `renderLoaded`, which waits for fetched content to appear —
    that content should no longer load while provisioning. Rewrite it to render directly (not via
    `renderLoaded`), assert the sync icon is present, and assert no gutter/line content renders and
    `fetch` was never called.
  - New test: "loads the real content once a provisioning synced tab transitions to synced" —
    render with `sync: 'provisioning'`, assert nothing loads, then `rerender` with `sync: 'synced'`
    and a new `url`, and assert the fetched content then appears.

## Out of scope

- Changing `src/index.ts`'s missing-file response (used correctly elsewhere for new files).
- Any change to the sync status icon's visuals or the provisioning/syncing/error status logic
  itself (`web/src/editor/EditorSyncIcon.tsx`) — this fix only affects when content is fetched.
