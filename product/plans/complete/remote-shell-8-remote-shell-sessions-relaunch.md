# Remote shell 8 — sessions, relaunch, and profiles for remote shells

**Complexity: 6/10** — a third remote process kind through persistence, snapshots, rows, and the sessions plugin; a new plugin `reattach` hook with an `adopt` launch mode; a temporary attach bridge for shell-launched sessions; and siblings reattached from one channel.

Run order: 8 of 8 in the remote shell series. Depends on plans 2, 3, 5, and 7.

Remote shell tabs survive `--relaunch` and can be detached and attached from the sessions tab, reusing their existing remote PTYs. Restored tabs keep their last reported cwd, workspace, offline mode, and zsh marker nonce. The sessions tab identifies parked shells as `shell`, and profile saving omits remote shells rather than saving commands that would launch local replacements.

## Design decisions

User decisions:

- Remote shell tabs are restored after `--relaunch` and attach like remote harness tabs, reattaching the same running PTY with its last reported cwd, workspace, and offline mode.
- The sessions tab lists a detached remote shell as `shell`.
- A restored shell starts with no navigator.
- Remote shells are not part of profile save/launch: a saved profile omits them rather than reissuing them as local shells.
- Rebuild a reattached shell through a new optional plugin `reattach` activation handler. It is additive, so `TAB_PLUGIN_API_VERSION` stays at 1.
- The plugin may request adoption only during its reattach handler and only for that handler's recorded PTY. The host injects the authorized id into terminal registration; ordinary terminal options cannot select an id.
- Shell-launched session attachment uses a temporary remote agent tab as the SSH prompt surface. Once the recorded shell tabs are restored on that channel, the temporary tab closes.
- Restored shell labels use the existing collision-safe label claiming behavior.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Session records and validation | `RemoteProcessKind`, `RemoteSessionRecord`, `launchKind` in `src/sessions/store.ts` |
| Snapshots and rows | `tabKind`, `processOf`, `recordOf` in `src/sessions/snapshot.ts`; `src/sessions/rows.ts` |
| Attach and restore | `startSessionAttach` in `src/sessions/attach.ts`; `restoreSessionTabs` in `src/sessions/restore-tabs.ts`; `settleResume` in `src/remote/resume.ts` |
| Recorded-id PTY registration | `registerRemotePty` in `src/pseudoterminal-manager.ts` |
| Row kinds | `RemoteSessionKind` in `src/protocol/sessions.ts`; `SessionRowKind` and `KINDS` in `src/plugins/sessions/shared.ts` |
| Shell process state from the far side | plan 3 (`shell: { nonce }`, `offline`, `cwd`) |
| Remote launch branch | `src/plugins/launch-tab-remote.ts` (plans 5 and 7) |
| Profile save skip precedent | the remote navigator skip in `writePluginEntry`, `src/profile/save/entries.ts` |

## Proposed changes

**Kinds and records.** Add `'shell'` to `RemoteProcessKind`, `RemoteSessionKind`, and `SessionRowKind`. Persist the shell's nonce, offline mode, and last reported cwd in `RemoteSessionRecord`. `recordOf` writes cwd from `tabRuntime` and identifies shell plugin tabs as `shell`; `processOf` and `rows.ts` list detached shells under that kind.

**`reattach` hook and `adopt` mode.** Add an optional `reattach(record, capabilities)` activation handler. Its record carries the label, nonce, cwd, workspace, offline mode, host, and recorded PTY id. `TabPluginLaunchRequest.remote` accepts `{ adopt: ... }` only while this handler runs, and the host requires the requested id to match the id in the reattach record. The host keeps the authorized id in its own tab preset and passes it to remote PTY registration; it is not an option on the public terminal resource. The shell plugin uses the handler to build a prompted terminal payload around the existing PTY and nonce. The API remains at version 1.

**Attach and restore.** `startSessionAttach` restores each shell process on the resumed shared channel, so sibling shells return together. For a shell-launched session, it uses a uniquely labeled temporary remote agent tab as the SSH prompt surface, does not adopt the launching PTY into an agent shell, and closes the bridge after at least one shell tab has been restored. Restoration claims a unique label for every shell before invoking the plugin hook. `restoreSessionTabs` waits for shell reattachment before replay is discarded. No navigator is restored.

**Profiles.** `writePluginEntry` skips a shell tab with a `remote` target, next to the remote navigator skip.

**Docs.** Update `product/specs/sessions-tab.md`, `product/specs/tabs.md`, and `product/specs/remote-server.md` for relaunch, attach, shell row kind, collision-safe labels, and the temporary SSH prompt bridge. Document the reattach and adoption contract in the tab plugin developer documentation and update user startup/command-bar guidance and the changelog.

## Tests

- `src/sessions/store.test.ts`, `snapshot.test.ts`, `rows.test.ts`, and `src/plugins/sessions/shared.test.ts` cover shell record validation, metadata, row kind, and detached rows.
- `src/sessions/attach.test.ts` and `src/sessions/shell-roundtrip.test.ts` cover reattaching the same PTYs, cwd, offline mode, nonce, shared-channel siblings, label collisions, the temporary prompt bridge, scrollback, and the absence of navigators.
- `src/plugins/launch-tab-remote.test.ts` covers adoption being refused outside reattach or for a mismatched id, and accepted for the matching host-authorized id.
- `src/plugins/shell/activate.test.ts` covers shell reattachment with the recorded nonce and PTY.
- `src/profile/save/index.test.ts` verifies that remote shells are omitted from saved profiles.

## Out of scope

Restoring remote file navigators. Profile save/launch of remote shells.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then manually:

- Open `zsh on <address>`, `cd src`, and press ➕.
- Relaunch the app. Confirm both remote shells return on the same PTYs, with their scrollback and cwd, and with their navigators closed.
- Detach one from the sessions tab, confirm its row reads `shell`, then attach it and confirm the shell is unchanged and any temporary prompt tab has closed.
- Save a profile and confirm neither remote shell is in it.
