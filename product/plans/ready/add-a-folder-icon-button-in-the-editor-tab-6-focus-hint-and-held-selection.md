# Focus hint and held selection

**Complexity: 5/10** — ~55 added lines, 4 files, 7 requirements, 13 test scenarios (p=5.60). One new pure decision and one hook rewrite, with the root-versus-hint ordering as the part that is easy to get wrong.

## Goal

Mark a reveal's restore hint as a focus hint and teach the navigator client to hold it until its row exists. The hint is applied when the row arrives, dropped when the user moves first or the tree re-roots afterwards, and left alone when it is an ordinary `files` restore hint.

## Design decisions and dependencies

This subplan depends on `add-a-folder-icon-button-in-the-editor-tab-3-local-reveal` and `add-a-folder-icon-button-in-the-editor-tab-4-remote-reveal` for the hint writer. `10-navigator-focus` consumes the outcome this subplan exposes, `11-sidebar-host-selection` reads the flag from the payload, and `07-reveal-applied-acknowledgement` clears it on the server. The source plan is `./product/plans/complete/add-a-folder-icon-button-in-the-editor-tab.md`; this is its "Selection and focus delivery" and "Selection timing" behavior on the client side.

This lands after `03` and `04`, and before `07`, `10`, and `11`. The type member must land in the same commit as, or before, the writer's `focus: true`: `reveal-editor.ts` does not compile with that member until `FileNavigatorRestoreHint` has it. Within this subplan, land the type member and the writer, then `focusHintStatus` with its tests, then the hook with its tests, so `check-diff` is green at each step.

- `FileNavigatorRestoreHint` (`src/tab/types.ts:174`) gains an optional `focus: true`, documented by a new comment on the member: the client holds the hint until the cursor row exists, moves focus once, and then reports the hint applied or dropped through `fileNavigatorRevealApplied`, and the server removes the member when that report arrives. The type carries no comment today, so the comment is written with the member. It is optional and only ever `true`, so an ordinary hint and its payload are unchanged. `src/tab/types.ts` is about 190 code lines and `max-lines` skips comments, so this one-line member leaves it under the 200-line limit; do not extract anything there.
- `revealEditorFile`'s hint write in `src/file-navigator/reveal-editor.ts` adds `focus: true` beside the fresh revision, `cursor`, `anchor`, and `selected`. Both the local and remote branches share that one write, so the flag cannot appear on one path and not the other.
- The pending-focus decision is one exported pure function in `web/src/file-navigator/file/navigator-selection.ts`, beside `selectionFromRestore` (`:106`). Name it `focusHintStatus`. It takes the current hint, the rows, the current root, the root the hint was first seen under, the last revision acted on, and whether the user has moved since the hint arrived, as positional arguments in that order — the style `selectFromPointer` (`:43`) and the file's other pure functions already use, not an options object. Its return is a plain four-value string union, `none`, `pending`, `ready`, or `dropped`, with no exported alias. `rows` is the same `FileNavigatorRow[]` the hook already receives.
- `none` means the hint carries no `focus`, or its revision has already been acted on. `dropped` means a focus hint is outstanding and the user moved first, or the current root differs from the root the hint was first seen under. `ready` means the hint's cursor path is present in `rows`. `pending` is everything else: a focus hint whose row has not arrived and whose root and user movement still allow it. A reveal hint always names its cursor, because `03` and `04` write all three fields; a hint carrying `focus` but no `cursor` can never become ready, so it is `dropped` rather than pending forever.
- The root-ordering rule is the subtle one. The hook records the root that was current when it first saw a revision. A fresh open, a retarget, or a remote re-root to the workspace root arrives in the same payload as the hint, so the first-seen root is already the new root and the status stays `pending` or `ready`. Only a root change after the hint arrived makes `currentRoot` differ from the first-seen root and drops it. The root compared is the hook's own `absoluteRoot` argument (`useFileNavigatorSelection.ts:18`), the value its effect already diffs through `previousRoot` (`:22`); never `files.root`, which is shortened for display and can mask a real change.
- `useFileNavigatorSelection` (`web/src/file-navigator/useFileNavigatorSelection.ts:17`) keeps today's behavior for a hint without `focus`: its existing effect applies `selectionFromRestore`, exactly as now, including the root-change reset and the `appliedRestore` revision guard.
- For a focus hint, that same effect evaluates `focusHintStatus` instead. On `pending` it records the revision and the first-seen root but does not act, and does not mark it acted on. On `ready` it applies `selectionFromRestore` with the hint, marks the revision acted on, and records the outcome as applied. On `dropped` it marks the revision acted on, changes no selection, and records the outcome as dropped.
- A pending focus hint holds back only its own application. The effect's root-change reset and its `reconcileSelection` on a rows update still run exactly as they do today, and a hint that later turns `ready` is applied over whatever selection they left. Deferring those as well would freeze the tree's cursor while a remote listing loads.
- The recorded outcome is React state, not a ref, because `10` reacts to it; the handlers below write the same state. The state holds one `(revision, outcome)` object and reuses it per value rather than building a fresh object each render, so `10`'s effect sees an identity change only when the outcome or the revision changes.
- The selection-changing handlers `replace`, `extend`, `pointer`, and `selectSiblings` are the user's cursor and click moves. While a focus hint is `pending`, any of them marks it dropped immediately and records the outcome, so a later row arrival cannot reapply an overtaken selection; once the outcome is `applied` or `dropped` they leave it alone. `rename` is a path rewrite, not a user move, and does not drop the hint. Dropping inside `replace` also covers the callers that reach it without a keyboard or click: the search pop-up's wait-for-row effect (`useFileNavigatorSearch.ts:24`), the new-directory auto-select (`FileNavigatorTab.tsx:68`), and a confirmed delete's `replace(null)` (`:48`).
- The hook returns a `focusHint` value beside the existing selection surface: `{ revision, outcome }` with `outcome` one of `pending`, `applied`, or `dropped`, or `undefined` when the current hint is not a focus hint. It returns the recorded outcome only while the current `restore` carries `focus` under that same revision, and `undefined` otherwise. That is what clears the value after `07` rewrites the hint without the flag, and it is also why a brand-new hint reads `undefined` for the one render before the effect records its `pending` or `applied`; no extra state or effect is added for either. `10` reads it to focus the tree and send the acknowledgement exactly once, deduping on `revision` because the value outlives the send. This is the seam the source plan describes as "reports that a focus hint was used", made explicit rather than inferred from the cursor.
- A missing file at reveal time leaves the hint pending: the row never arrives, so it is neither applied nor dropped. The tree still takes focus when the hint arrives in `10`, and the next reveal's revision supersedes the pending one. That preserves the source plan's silent outcome and adds no timer or timeout. The consequence is that the server's hint keeps `focus` until a later reveal or a `files` hint overwrites it; that residue is accepted, and no client-side clear or timer is added to remove it.
- A newer hint of either kind replaces the server's hint wholesale — `restoreHint` in `src/file-navigator/restore-command.ts:53` builds a fresh object, and `03`/`04`'s writer does the same — so a pending revision that a newer hint supersedes needs no acknowledgement: the flag is already gone from the payload. The client sends nothing for the abandoned revision and must not resurrect it. `appliedRestore` only ever compares against the current hint's revision, and `10`'s floor ignores anything at or below the newest revision it acknowledged. An ordinary hint that arrives after a pending focus hint is applied immediately, exactly as today.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | How this subplan uses it |
| --- | --- | --- |
| Restore hint type | `src/tab/types.ts:174` (`FileNavigatorRestoreHint`) | One optional member added. |
| Restore application | `web/src/file-navigator/file/navigator-selection.ts:106` (`selectionFromRestore`) | Reused unchanged for the ready and ordinary paths. |
| Current selection hook | `web/src/file-navigator/useFileNavigatorSelection.ts:17` | Grows the focus branch and the outcome; the ordinary path stays. |
| Revision guard | `useFileNavigatorSelection.ts:23` (`appliedRestore`) | Kept; the focus branch uses it as the acted-on revision. |
| Reveal hint writer | `src/file-navigator/reveal-editor.ts` (from `03` and `04`) | Adds one member. |
| Hook call site | `web/src/file-navigator/FileNavigatorTab.tsx:29` | Supplies `files.rows`, `files.absoluteRoot`, the label, and `files.restore`; unchanged, so no other call site needs the new value. |
| Selection-surface consumers | `FileNavigatorRows.tsx:15`, `use-file-navigator-row-events.ts:20`, `useFileNavigatorKeyDown.ts:29` (all type themselves as `ReturnType<typeof useFileNavigatorSelection>`) | Receive `focusHint` through the return type; no edit. |
| Row and keyboard handlers | `use-file-navigator-row-events.ts:43` (`selection.pointer`), `:52` (`selection.replace`), `useFileNavigatorKeyDown.ts:52`, `:64`, `:67`, `navigator-chords.ts:33` (`selectSiblings`) | The existing entry points that will set the user-moved drop; none of them changes. |
| Selection tests | `web/src/file-navigator/file/navigator-selection.test.ts`, `web/src/file-navigator/useFileNavigatorSelection.test.ts` | New cases beside the existing ones; both already use `renderHook` or plain calls. |
| Search pop-up's wait-for-row precedent | `web/src/file-navigator/useFileNavigatorSearch.ts:21` | The model for waiting until a row exists before selecting. |

## Proposed changes

- Add `focus?: true` to `FileNavigatorRestoreHint` with the comment above.
- Add `focus: true` to the reveal hint write in `reveal-editor.ts`. Do not add it anywhere else; the `files` command's `restoreHint` in `src/file-navigator/restore-command.ts:53` must stay unchanged.
- Add `focusHintStatus` to `navigator-selection.ts`, with the inputs and four outcomes above. Keep it pure; it takes no refs and calls no hook.
- Extend `useFileNavigatorSelection` with the first-seen-revision-and-root ref, the user-moved flag, the focus branch, the `focusHint` state, and the handler-driven drop. The ordinary restore path and the registry publishing effects stay exactly as they are, and the drop is a plain addition inside `replace`, `extend`, `selectSiblings`, and `pointer`.
- Size: the hook is 91 code lines (105 raw) today and lands near 130 code lines; `navigator-selection.ts` is 115 code lines (126 raw) and lands near 140. Both stay under the 200-line `max-lines` limit, so no extraction is expected. If the hook does cross it, move the focus decision plumbing into `file/navigator-focus.ts` and import it, rather than compacting the hook.
- Add no client focus call here. This subplan decides and holds; `10` focuses and acknowledges.

## Tests

In `web/src/file-navigator/file/navigator-selection.test.ts`:

- A focus hint whose cursor row is absent is `pending`; once the row appears it is `ready`.
- A hint without `focus` is `none`, and an ordinary hint is never treated as pending.
- A revision already acted on is `none` even when the row exists.
- A root change after the hint's first-seen root is `dropped`; the same root as the first-seen root is not.
- A user move flag turns a pending hint into `dropped`.
- A focus hint with no `cursor` is `dropped`, not pending forever.

In `web/src/file-navigator/useFileNavigatorSelection.test.ts`:

- A focus hint whose row arrives in a later `rows` update selects it only then, and the returned outcome moves from `pending` to `applied`.
- A focus hint overtaken by a user selection before its row arrives is never applied, and its outcome is `dropped`.
- An ordinary hint still applies at once and reports no focus outcome.
- A focus hint that arrives with a root change in the same update is still applied when its row exists or arrives; a root change in a later update drops it.
- A revision already applied is not applied again on a later broadcast.
- While a focus hint is pending, a rows update that removes an unrelated row still reconciles the existing cursor, and the later arrival applies the hint over that reconciled selection. Assert the intermediate cursor, so the case proves the reconcile ran rather than being skipped while the hint is pending.

In `src/file-navigator/reveal-editor.test.ts`, add one assertion in `03`'s local reveal case that the reveal hint carries `focus: true`; the field-level assertions from `03` stay valid, and `04`'s remote cases need none of their own because both branches share that one write.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Run `npx vitest run --project client web/src/file-navigator/file/navigator-selection.test.ts web/src/file-navigator/useFileNavigatorSelection.test.ts` and `npx vitest run --project server src/file-navigator/reveal-editor.test.ts`. Read the diff to confirm no ordinary hint path gained a wait, and that the `files` command's hint writer is untouched.

There is no manual end-to-end check at this stage: nothing writes a focus hint until `05` and `08` land, and the visible tree-focus outcome is `13-end-to-end-verification`'s. Do not add a temporary caller or a debug control to produce one.

## Out of scope

- No focus call, no scroll code, and no acknowledgement send; `10` owns those.
- No server clearing of the flag; `07` owns that.
- No sidebar selection; `11` reads the flag.
- No change to `selectionFromRestore`, `reconcileSelection`, the search pop-up, or the `files` command's restore behavior.
- No timeout for a missing row; the source plan specifies silence, not a timer.
