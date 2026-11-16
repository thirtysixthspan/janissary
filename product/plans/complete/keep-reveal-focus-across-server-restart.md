# Keep reveal focus working after a server restart

**Complexity: 2/10** — ~2 added lines across 1 production file, 4 requirements, and 4 test scenarios (p=3.84).

`src/file-navigator/restore.ts` keeps a module-level `nextRevision` counter that starts at 1 in every server process. `web/src/file-navigator/useFileNavigatorRevealFocus.ts` keeps the highest acknowledged revision per navigator label in a module-level map that survives a reconnect and is never cleared. After a server restart with the page still open, the first reveal on a reused `navigator` label carries a revision at or below the client's remembered floor. Both the focus effect and the acknowledgement effect skip it, so the selection still applies but the tree never takes focus and the hint is never acknowledged. A later remount can then replay focus on the unacknowledged hint, which is what the floor exists to prevent.

## Goal

Make a new server process's revision sequence start above any revision a client could have acknowledged from the previous process, while keeping revisions monotonic within a process and leaving every hint consumer unchanged. Do not reset the client's floor on reconnect: a stale hint from the same server must still be unable to refocus.

## Approach

Keep the module-level counter in `src/file-navigator/restore.ts` and initialize it from `Date.now()` rather than 1. `Date.now()` is an integer, so `nextRestoreRevision` still returns integers, and every process started at a distinct millisecond begins its sequence above the previous process's small incrementing values. The counter has plenty of room: `Date.now()` is about 1.7e12, far below `Number.MAX_SAFE_INTEGER`.

Leave `nextRestoreRevision`'s signature, the hint shape, and `clearRevealFocus`'s equality check alone. Those consumers treat revisions as opaque, so no client or server comparison changes. Leave `useFileNavigatorRevealFocus.ts` alone so its map remains the per-label floor across reconnects.

## Implementation steps

1. In `src/file-navigator/restore.ts`, initialize `nextRevision` from `Date.now()` instead of `1`, and extend the comment above it to say the base is per-process so a restart's first revision lands above a client's remembered floor. Keep `nextRestoreRevision` and the rest of the module unchanged.
2. Add `src/file-navigator/restore.test.ts` asserting two successive `nextRestoreRevision()` calls return integers and the second is greater than the first.
3. Add a case under `FileNavigatorTab.test.tsx`'s `reveal focus` describe using a distinct label: acknowledge a high revision, rerender with a lower revision and assert neither focus nor `fileNavigatorRevealApplied` runs, then rerender with a higher revision and assert both run.

## Tests

- `src/file-navigator/restore.test.ts`: two successive `nextRestoreRevision()` calls return integers; the second exceeds the first. The existing `reveal-editor.test.ts` before/greater-than assertions must pass unchanged.
- `web/src/file-navigator/FileNavigatorTab.test.tsx` under `reveal focus`: with a distinct navigator label, a high revision is focused and acknowledged; a lower revision then neither focuses nor acknowledges; a higher revision does both. The existing fixed-revision cases must pass unchanged.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npx vitest run --project server src/file-navigator/restore.test.ts src/file-navigator/reveal-editor.test.ts`, then `npx vitest run --project client web/src/file-navigator/FileNavigatorTab.test.tsx`.

## Out of scope

- Resetting or versioning the client's acknowledged floor on reconnect.
- Any change to `nextRestoreRevision`'s signature, the hint shape, `clearRevealFocus`, or `useFileNavigatorRevealFocus`.
- Spec and documentation changes: the documented behavior, that the tree takes focus when a reveal is handled, already promises this; only an implementation detail that broke it changes.
- Any change to the ordinary `files` restore path beyond sharing the same counter.
