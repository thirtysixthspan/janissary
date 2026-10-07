# Remote shell 8 — sessions, relaunch, and profiles for remote shells

**Complexity: 6/10** — a third remote process kind through persistence, snapshots, rows, and the sessions plugin; a new plugin `reattach` hook with an `adopt` launch mode; a third attach branch; and siblings reattached from one channel.

Run order: 8 of 8 in the remote shell series. Depends on plans 2, 3, 5, and 7.

Remote harness tabs survive `--relaunch` and can be detached and reattached from the sessions tab, which reattaches the same running process. A remote shell tab from plans 5 and 7 cannot yet do this:

- the session store knows only `'harness' | 'agent'` (`src/sessions/store.ts:22,100`);
- `tabKind` reports plugin tabs as `'agent'` (`src/sessions/snapshot.ts:14-18`);
- `restoreSessionTabs` skips every non-`pipe` process (`src/sessions/restore-tabs.ts:54`);
- nothing in the plugin contract can rebuild a plugin tab around an already-running PTY.

This plan closes those gaps.

## Design decisions

User decisions:

- Remote shell tabs are restored after `--relaunch` and attach like remote harness tabs, reattaching the same running PTY with its last reported cwd, workspace, and offline mode.
- The sessions tab lists a detached remote shell as `shell`.
- A restored shell starts with no navigator.
- Remote shells are not part of profile save/launch: a saved profile omits them rather than reissuing them as local shells.
- Rebuild a reattached shell through a new optional plugin `reattach` activation handler. It is additive, so `TAB_PLUGIN_API_VERSION` stays at 1.

The far side already ignores a spawn for an id it holds, so binding the recorded PTY id restarts nothing.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Session records and validation | `RemoteProcessKind`, `RemoteSessionRecord`, `launchKind` in `src/sessions/store.ts` |
| Snapshots and rows | `tabKind`, `processOf`, `recordOf` in `src/sessions/snapshot.ts`; `src/sessions/rows.ts` |
| Attach and restore | `startSessionAttach` in `src/sessions/attach.ts:101-125`; `restoreSessionTabs` in `src/sessions/restore-tabs.ts`; `settleResume` in `src/remote/resume.ts` |
| Recorded-id PTY adoption | `registerRemotePty`'s `recordedId` path in `src/pseudoterminal-manager.ts:106` (used by the harness's `resumePtyId`) |
| Row kinds | `RemoteSessionKind` in `src/protocol/sessions.ts:8`; `SessionRowKind` and `KINDS` in `src/plugins/sessions/shared.ts`; `launchKind` as the row kind in `src/plugins/sessions/actions.ts:117` |
| Shell process state from the far side | plan 3 (`shell: { nonce }`, `offline`, `cwd`) |
| Remote launch branch | `src/plugins/launch-tab-remote.ts` (plans 5 and 7) |
| Profile save skip precedent | the remote navigator skip in `writePluginEntry`, `src/profile/save/entries.ts:96,130` |

## Proposed changes

**Kinds and records.** Add `'shell'` to these kinds:

- `RemoteProcessKind` and the `launchKind` validator in `src/sessions/store.ts`;
- `RemoteSessionKind` in `src/protocol/sessions.ts`;
- `SessionRowKind` and `KINDS` in `src/plugins/sessions/shared.ts`.

`RemoteSessionRecord` gains the shell's nonce, offline mode, and last reported cwd. `recordOf` writes the cwd from `tabRuntime` and stops defaulting a plugin tab to `'harness'`. The `home` field already comes from plan 2. `tabKind` returns `'shell'` for a tab whose `plugin?.id` is `shell`. `processOf` and `rows.ts` list a detached shell under `shell`.

**`reattach` hook and `adopt` mode.** `TabPluginActivation` gains an optional `reattach(record, capabilities)`. Its record carries the label, nonce, cwd, workspace, offline mode, `host`, and the recorded PTY id. `TabPluginLaunchRequest.remote` also accepts `{ adopt: { ptyId } }`, which is valid only during a `reattach` call. With it, the host opens the tab under the recorded label with the preset `remote` target, and binds the PTY through `registerRemotePty`'s `recordedId` path instead of sending a fresh spawn. The shell plugin answers `reattach` with an `adopt` launch whose factory builds the terminal payload around the recorded id and nonce, with `prompted` set.

**Attach and restore.** `startSessionAttach` gains a third branch for a channel whose launching process is a shell. It opens the channel with its resume, then calls the shell plugin's `reattach` for each shell process in the channel's process-state list, so siblings on one channel are restored together. `restoreSessionTabs` stops skipping non-`pipe` processes that carry `shell`. No navigator is restored.

**Profiles.** `writePluginEntry` (`src/profile/save/entries.ts:130`) skips a shell tab with a `remote` target, next to the remote navigator skip at `:96`.

**Docs.** Update `product/specs/sessions-tab.md`, `product/specs/tabs.md`, and `product/specs/remote-server.md` for relaunch, attach, and the `shell` row kind. In `documentation/developer-documentation/tab-plugins.md`, document `reattach` and `remote.adopt`, with a changelog entry.

## Tests

- `src/sessions/store.test.ts`: shell records validate and persist, and an unknown kind is rejected.
- `src/sessions/snapshot.test.ts` and `rows.test.ts`: `tabKind` returns `shell`, and a detached shell lists under `shell`.
- `src/plugins/sessions/shared.test.ts`: the `shell` kind validates.
- `src/sessions/attach.test.ts`, and a new `src/sessions/shell-roundtrip.test.ts` modeled on `harness-roundtrip.test.ts`: attach and `--relaunch` rebuild the same PTY with its cwd, offline mode, and nonce and no navigator, and two siblings on one channel come back together.
- `src/plugins/launch-tab-remote.test.ts`: `adopt` is refused outside `reattach` and binds the recorded id.
- `src/plugins/shell/activate.test.ts`: `reattach` produces a terminal payload with the recorded nonce.
- `src/profile/save/index.test.ts`: a remote shell is omitted from a saved profile.

## Out of scope

Restoring remote file navigators. Profile save/launch of remote shells.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then manually:

- Open `zsh on <address>`, `cd src`, and press ➕.
- Relaunch the app. Confirm both remote shells return on the same PTYs, with their scrollback and their cwd, and with their navigators closed.
- Detach one from the sessions tab, confirm its row reads `shell`, then attach it and confirm the shell is unchanged.
- Save a profile and confirm neither remote shell is in it.
