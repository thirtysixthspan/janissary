# Clickable resync button for a GitHub-synced editor tab

**Complexity: 4/10** — the pull-and-conflict-handling machinery this needs already exists (the
save-triggered sync cycle and the disk-watcher-driven live-reload/conflict path); the new work is a
manual trigger for the pull half of that cycle plus a click affordance on an icon that's currently
inert.

## Goal

A GitHub-synced editor tab's sync status icon (`EditorSyncIcon`, `synced` or `error` state) becomes
clickable. Clicking it re-pulls the shared sync workspace from `origin/master`, shows `syncing`
while that's in flight, and lands back on `synced` or `error`. If the pull actually changed the
file and the buffer has unsaved edits, the existing overwrite-conflict prompt covers it on the next
save — the same "remote always wins" policy `git-sync.ts` already documents; if the buffer is
clean, the fresh content loads automatically. No new conflict UI is introduced.

## Design decisions

**Reuse `GitSync.openSync()` — the same pull-only cycle a synced tab already runs on open —
instead of writing a new sync method.** A manual resync only needs to pull; there's nothing to
commit or push (that's `saveSync`'s job, already wired to save). `openSync()` does exactly the pull-
rebase-with-remote-wins cycle `git-sync.ts` already implements.

**Let the existing on-disk file watcher do the reload/conflict work — don't duplicate it.**
`EditorWatchManager` already watches every synced tab's file and, on any external mtime change,
sets `tab.editor.mtimeMs`, which the client's `useEditorWatchReload` hook already turns into either
a silent reload (buffer clean) or a pending-conflict flag surfaced on the next save (buffer dirty).
Since `openSync()`'s `pullRebase` writes straight to the file the watcher is already watching, a
pull that actually changes the file fires that same watcher path with no new code. This resync
handler's only job is to run the pull and reflect `syncing` → `synced`/`error`, mirroring
`syncAfterSave` in `src/editor/save.ts` exactly (including its message-bus `state` broadcast after
each transition).

**Fire-and-forget RPC, not a request/reply.** The click's result surfaces entirely through the
normal `sync` field transitions already broadcast over `state`, the same as the save-triggered
cycle — there's nothing to return. This follows `closeEditorConnection`'s existing pattern
(`client.send(...)` with no dedicated `JanusClient` method) rather than `editorSync`/`pageSync`'s
named-method wrappers, since this is a one-off user action, not a repeated per-keystroke call.

**Guard against redundant clicks server-side, not just by hiding the affordance.** The handler
no-ops when the tab isn't synced, or is already `provisioning`/`syncing` — mirroring how the client
only renders the icon as clickable in `synced`/`error` states, but enforced on the server too since
a stale click already in flight when the state changes must not double-trigger.

## Implementation

1. **`src/protocol.ts`**: add `{ method: 'resyncEditorTab'; params: { url: string } }` to
   `RpcCall`, next to `editorSync`, documenting that `url` identifies the tab the same way
   `saveFile`'s does and that this is fire-and-forget.

2. **`src/editor/resync.ts`** (new): `resyncEditorTab(managers: Managers, url: string):
   Promise<void>`. Finds the tab by `editor.url`; no-ops if missing, if `editor.sync` is unset, or
   if it's already `'provisioning'` or `'syncing'`. Otherwise sets `sync: 'syncing'`, emits `state`,
   awaits `managers.gitSync.openSync()`, then re-looks-up the tab (it may have closed meanwhile) and
   sets `sync: 'error' in result ? 'error' : 'synced'`, emitting `state` again — structurally
   identical to `syncAfterSave` in `src/editor/save.ts`.

3. **`src/controller.ts`**: add `resyncEditorTab(url: string): void { void resyncEditorTab(this.managers, url); }`,
   importing the new module the same way `saveFile`/`syncEditorBuffer` are imported and delegated.

4. **`src/message-handler.ts`**: add `case 'resyncEditorTab': { controller.resyncEditorTab(message.params.url); break; }`
   next to the existing `editorSync` case.

5. **`web/src/editor/EditorSyncIcon.tsx`**: add an optional `onClick?: () => void` prop. Only
   `synced` and `error` are clickable (not `provisioning` — no workspace yet — or `syncing` —
   already in flight): when `onClick` is provided and `sync` is one of those two, render the icon as
   a `<button>` instead of a `<span>`, call `onClick` on click, append a `editor-sync-icon--clickable`
   class, and extend its tooltip with " — click to resync". Otherwise render exactly as today
   (existing tests for `provisioning`/`syncing`, and any render without `onClick`, are unaffected).

6. **`web/src/editor/EditorMetaRow.tsx`**: add an `onSyncClick?: () => void` prop and pass it
   through to `EditorSyncIcon` as `onClick`.

7. **`web/src/EditorTab.tsx`**: pass `onSyncClick={() => client.send({ method: 'resyncEditorTab', params: { url: editor.url } })}`
   into `EditorMetaRow`.

## Tests

- **`src/editor/resync.test.ts`** (new, mirroring `src/editor/save.test.ts`'s `'saveFile git sync'`
  describe block): transitions `syncing` → `synced` on a successful pull; transitions to `error`
  when `openSync` reports one; stays `syncing` while the pull is still pending (using
  `Promise.withResolvers`); no-ops (no state change, `openSync` never called) for a tab with no
  `sync` field, one that's `provisioning`, one that's already `syncing`, and an unresolvable url.
- **`src/message-handler.test.ts`**: add `resyncEditorTab: vi.fn()` to the mock controller and a
  `'routes resyncEditorTab'` case, mirroring the existing `'routes editorSync'` test.
- **`src/controller.test.ts`**: add a case to the `'Controller direct RPC delegators'` describe
  block — `resyncEditorTab` RPC no-ops for an unresolvable url — mirroring the adjacent
  `syncEditorBuffer`/`syncPageSnapshot` case.
- **`web/src/editor/EditorSyncIcon.test.tsx`**: clicking the icon in the `synced` state (with
  `onClick` provided) calls it; same for `error`; no click handler is wired when `sync` is
  `provisioning` or `syncing` even if `onClick` is provided; a render without `onClick` stays
  non-interactive (existing tests already cover this, left unchanged).
- **`web/src/editor/EditorMetaRow.test.tsx`** (if it exists — otherwise skip, this is a thin prop
  passthrough): `onSyncClick` reaches `EditorSyncIcon`'s `onClick`.
- **`web/src/EditorTab.test.tsx`**: clicking the sync icon on a `synced` tab sends
  `resyncEditorTab` with the tab's url.

Run `./scripts/run.mjs check-diff`.

## Out of scope

- Any new conflict-resolution UI — the existing overwrite-conflict dialog (triggered via
  `conflictPendingRef` on the next save) already covers "resolving conflicts if necessary" per the
  issue's own wording, and `git-sync.ts`'s remote-always-wins policy is the established design for
  every other sync path (open, save, live external-change reload); resync follows the same rule.
- A visible spinner or progress indicator beyond the existing `syncing` icon state.
- Manual resync for anything other than a GitHub-synced editor tab (the icon, and therefore the
  button, doesn't exist for a plain editor tab).
