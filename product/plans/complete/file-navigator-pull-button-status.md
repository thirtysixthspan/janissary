# The file navigator's pull button signals working, success, and failure

**Complexity: 5/10** — the editor's sync icon already establishes the vocabulary (a spinning icon
while work is in flight, green when it worked, red when it did not) and the file navigator already
tracks a pull's in-flight bit server-side. The work is to widen that bit into a three-state status
the tree's payload carries, flash the terminal state for a moment before returning the button to
rest, and render it the way `EditorSyncIcon` renders sync.

## Goal

Clicking the file navigator header's **Pull from origin** button makes the button itself say what is
happening. It spins while the pull runs, turns green when the pull succeeds, turns red when it
fails, and returns to its ordinary muted resting state a few seconds later. Its tooltip names the
same three states. This is the signal the editor's GitHub sync icon already gives an editor tab, on
the one file navigator action that does comparable work.

## Design decisions

**The status is server state on the tree's payload, not client state.** The server already owns
whether a pull is in flight — that is what coalesces a second click — and architecture principle 1
forbids forking a piece of state so both sides compute it. So the in-flight bit widens into a
three-state status the server owns and `FileNavigatorView` carries, and the button is a pure
projection of it. This also means the status survives a re-render, a dock move, and a second client
attaching mid-pull.

**`pullInFlight` becomes `pull`, rather than gaining a sibling.** A boolean plus a status field would
be two spellings of the same fact, and the coalescing check would have to pick one. `pull` is the
single field: `'pulling'` is the in-flight state the coalescing check reads, and the two terminal
states are the ones the boolean never had.

**The terminal states flash, then clear.** The editor's `synced`/`error` are durable properties of a
file that stays synced; a pull is a one-shot action, and a button left permanently red after one
failed pull would be noise that never clears. So `pulled` and `error` hold for three seconds and then
return the button to rest. The durable record of what happened is the notifications line the pull
already posts. Three seconds is longer than the editor's 1.5-second "Saved" flash because a pull runs
long enough that the user may well have looked away while it did.

**The spin keyframe is shared, not copied.** `@keyframes editor-sync-spin` is renamed `icon-spin` and
used by both the editor sync icon and the pull button. The issue asks for the same animation, and two
identical keyframe blocks under different names is the way that stops being true later.

**The pull flow moves into `manager-pull.ts`.** `FileNavigatorManager.pull` is already the longest
method on a class that sits close to the 200-line limit, and the status transitions plus the flash
timer roughly double it. It follows `manager-mutations.ts` and `manager-files.ts` out of the class,
reached through the existing `MutationContext` widened with `refreshGit`. The manager keeps the
one-line delegation.

**The button stays clickable in every state.** `EditorSyncIcon` goes inert while provisioning or
syncing because a click there has nothing to act on. A pull click is already coalesced server-side,
so a click while spinning is harmlessly ignored, and making the button inert would only cost the
user the tooltip.

## Implementation

1. **`src/tab/types.ts`**: export `FileNavigatorPullStatus = 'pulling' | 'pulled' | 'error'` and add
   `pull?: FileNavigatorPullStatus` to `FileNavigatorView`, documented as the header button's
   working/success/failure signal and absent at rest.

2. **`src/protocol.ts`**: re-export `FileNavigatorPullStatus` alongside `FileNavigatorView` and
   `FileNavigatorDetail`, so `web/src/` imports it from `@shared/protocol` rather than restating it.

3. **`src/file-navigator/state.ts`**: replace `pullInFlight?: boolean` with
   `pull?: FileNavigatorPullStatus` and add `pullFlash?: ReturnType<typeof setTimeout>`, the timer
   that returns a terminal state to rest.

4. **`src/file-navigator/manager-payload.ts`**: `writeRebuiltPayload` copies `state.pull` onto the
   payload. `writeCreatedPayload` does not — a tree still waiting for its root shows no branch, so it
   has no pull button to signal on.

5. **`src/file-navigator/manager-pull.ts`** (new): `PullContext = MutationContext & { refreshGit }`
   and `runPull(context, label)`, holding what `FileNavigatorManager.pull` holds today plus the
   status transitions. Start: return early when `state.pull === 'pulling'`, clear any pending flash
   timer, set `'pulling'`, rebuild to broadcast. Settle: post the notification, clear the filesystem
   cache when the tab still exists at the same root, set `'pulled'` or `'error'`, rebuild once, arm
   the three-second flash timer, and refresh git metadata on the success path. The flash timer clears
   `pull` and rebuilds again. A tab that closed mid-pull still gets its notification and nothing else.

6. **`src/file-navigator/manager.ts`**: `pull(label)` delegates to `runPull`, passing the mutation
   context widened with `refreshGit`. Drops the `notify`, `clearFilesystemCache`, and pull-report
   imports the extracted flow takes with it.

7. **`src/file-navigator/manager-profile.ts`**: `closeTabState` clears `pullFlash` beside the
   debounce timer it already clears — architecture principle 6, a resource released where it was
   acquired.

8. **`web/src/file-navigator/FileNavigatorPullButton.tsx`**: take an optional `status`, render
   `files-pull files-pull--<status>` and a status-specific tooltip, mirroring `EditorSyncIcon`'s own
   `TOOLTIPS` record. No status renders exactly what it renders today.

9. **`web/src/file-navigator/FileNavigatorHeader.tsx`**: an optional `pull` prop passed through to the
   button.

10. **`web/src/file-navigator/FileNavigatorTab.tsx`**: pass `pull={files.pull}`.

11. **`web/src/theme.css`**: rename `@keyframes editor-sync-spin` to `icon-spin` and update the editor
    selector that uses it; add `.files-pull--pulling svg` spinning with the same keyframe, and
    `.files-pull--pulled` / `.files-pull--error` colored with `--success` / `--error`, the same
    variables the sync icon uses. The new state rules follow the shared `.files-pull:hover` rule so a
    status color is not lost on hover.

## Tests

- **`src/file-navigator/manager.test.ts`**: a pull marks the payload `pulling` immediately; a
  successful pull settles to `pulled` and clears back to undefined after the flash window; a failed
  pull settles to `error` and clears the same way; the coalescing test reads `pull` rather than
  `pullInFlight`; closing a tab mid-flash does not fire a timer against a gone tab.
- **`web/src/file-navigator/FileNavigatorPullButton.test.tsx`**: renders no status modifier and the
  plain tooltip at rest; renders `files-pull--pulling`, `--pulled`, and `--error` with their own
  tooltips; still forwards clicks in every state.
- **`web/src/file-navigator/FileNavigatorHeader.test.tsx`**: the header passes `pull` through to the
  button.
- **`web/src/file-navigator/FileNavigatorTab.test.tsx`**: a tree whose payload carries
  `pull: 'pulling'` renders the spinning modifier on its pull button.

Run `./scripts/run.mjs check-diff` after each step.

## Out of scope

- Any change to what a pull does, what it reports to the notifications tab, or how clicks are
  coalesced. Only the button's own appearance changes.
- A progress percentage, a byte count, or any other detail beyond the three states.
- Making the button inert in any state, per the design decision above.
- The editor sync icon's own behavior. It changes only by way of the shared keyframe's new name.

## Spec and documentation

- **`product/specs/file-navigator-tab.md`** — the pull paragraph gains what the button itself shows
  while pulling and after it settles.
- **`documentation/user-documentation/tab-types/file-navigator.md`** — "Pulling the latest from
  origin" gains the same, in the reader's terms.
- `help.md` documents the `files` command and its chords only, so it needs no change.
