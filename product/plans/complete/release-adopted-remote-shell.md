# Release an adopted remote spawn id when its reattach does not produce a shell

Complexity: 4/10

## Goal

`ShellManager.adoptRemoteShell` parks a recorded spawn id keyed by tab label, consumed only when
`spawnFor` next needs that tab's shell — so a failed reattach, or one whose tab is closed before any
command runs, leaves it indefinitely, and the label reuse path (`uniqueLabel` frees the label on tab
close) lets a later remote agent tab granted the same label bind its first shell to a spawn id
belonging to a process on a different channel instead of starting its own. Give the adoption a
release, drop it on every non-`reattached` reattach outcome, and refuse to adopt across channel
boundaries.

## Approach

The adoption carries the session id beside the spawn id. At `spawnFor` time the tab's current
channel's `sessionId` must match what was recorded — a tab on a different channel (a fresh session
that reused the label) does not adopt and mints its own `rsh…` id. The adoption is freed when the
tab closes (through the existing `MANAGER_TAB_RELEASE` walk into `ShellManager.close`) and when
`startSessionReattach` settles with anything other than `reattached`. The record in
`src/sessions/store.ts` carries the session id, so both `adoptRemoteShell` call sites can supply it.

## Implementation steps

1. `src/shell/manager.ts` — `adopted` stores `{ id, session }`; `adoptRemoteShell(label, id,
   session?)`; `spawnFor` consumes the adoption only when the tab's channel's `sessionId` matches
   (deleting it either way), else mints `rsh…`; new `releaseAdoptedShell(label)`; `close(label)`
   drops the label's adoption; `closeAll` clears the map.
2. `src/sessions/restore-tabs.ts` — pass `record.session` to `adoptRemoteShell`.
3. `src/sessions/reattach.ts` — pass `record.session`; in the settle path, call
   `managers.shell.releaseAdoptedShell(label)` for every non-`reattached` outcome.

## Tests

`src/shell/manager.test.ts` (the existing remote-shell case pinning `rsh…` minting keeps passing):

- a remote tab binds its first shell to the adopted spawn id when its channel matches;
- the adoption is gone after the tab closes — the next shell mints `rsh…`;
- a tab whose channel session does not match the adoption does not adopt it;
- `releaseAdoptedShell` drops the adoption so the next shell mints.

## Out of scope

- The harness branch's `resumePtyId` pass-through (`registerRemotePty`), which binds at tab
  creation and has no adopt-until-later window.
- The reuse-after-label-free path beyond the channel check (uniqueLabel behavior itself).
