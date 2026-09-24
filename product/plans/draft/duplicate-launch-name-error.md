# Duplicate launch name error

**Complexity: 7/10** — the remote refusal is a new protocol frame with routing through five layers, plus version bump, a retry loop over fresh connections for default names, automatic deletion of workspaces gated on a liveness definition, and seven local entry points to converge on one check.

## Summary

Feature text: "when trying the launch a new harness/agent, a harness/agent with the same name that already exists either in the sessions table, on the remote machine running or on the remote machine running but not cleaned up, should report an informative error into the notifications tab and prevent a new harness/agent from launching."

Today a name collision is handled three different ways, none of them in the notifications tab. A local agent whose name matches an open tab is refused with `Agent "<x>" is already active.` in the creator's transcript. A harness whose name matches an open tab is silently renamed (`claude-2`). A remote launch whose name matches a leftover workspace on the far host gets past every local check, then fails with `git clone exited with code 128`, surfaces as the tab's provision error, and the tab closes itself. Nothing checks the sessions table's parked records or the remote host's running peers by name.

This plan does three things. A launch whose explicit name clashes with an open tab, a live sessions-table row, or something running on its target host is refused, and the refusal goes to the notifications feed. A default name (bare `harness claude`, or an agent's pool name) is moved to the next free name instead. A leftover workspace with nothing running in it is removed automatically, locally or remotely, and the launch goes ahead.

## Design decisions

1. **Explicit names are refused; default names move aside.** A name the user typed (`agent foo`, `harness claude as foo`, a profile entry's `name`) is refused on any clash. A default name (bare `harness claude` → `claude`, or a pool name for an unnamed agent) keeps its current behavior of moving to the next free name. The set of names it skips now also includes live sessions-table rows and, for remote launches, names running on the target host.
2. **Where a name clashes.**
   - **Open tabs:** any open tab with the same label, on any host.
   - **Sessions table:** a sessions-table row of type `harness` or `agent` whose state is `provisioning`, `active`, `reconnecting`, or `detached`, on any host. `terminated` rows, `ssh` rows, and `navigator` rows never clash.
   - **Remote host:** for a remote launch, anything with that name running on the launch's target host. A local launch queries no remote host.
3. **"Running" means a live janissary owner.** A workspace named `<name>` counts as running when any of these holds:
   - a `janus remote-serve` peer record (`<root>/.janissary/remote/<session>.json`, attached or parked) carries that label and its pid is alive;
   - an open local tab uses it;
   - a janus instance lock inside it (`<ws>/.janissary/lock`) belongs to a live process.

   A plain shell sitting in the folder does not count.
4. **Leftovers are removed automatically, locally and remotely.** A workspace folder named `<name>` with nothing running in it is removed before the launch goes ahead, even if it has uncommitted or unpushed changes. Peer records whose pid is dead are left in place: the liveness check already ignores them, and the existing attach path treats a dead recorded pid as terminated (`relayPeer`, `src/remote/serve-detach.ts`). The removal is announced with one notification, and then the launch continues normally. Local `-w` launches follow the same rule.
5. **A failed removal refuses the launch** and names the path and the reason.
6. **A remote check that can't be answered refuses the launch** (unreachable host, failed auth, or the ssh connection ending for any other reason before provisioning answers). That failure is reported through the notifications feed with the reason. No new timeout is added: the check rides the launch's own ssh connection, so it ends when ssh itself gives up, and until then the placeholder shows ssh's prompts exactly as today.
7. **Refusals and cleanups are reported only in the notifications feed.** Nothing is written into the creator's transcript. This also moves the two existing transcript lines in `newAgentOp`, `Agent "<x>" is already active.` and `All agent names are in use.`, into the notifications feed. The notification is attributed to the tab the command was typed in.
8. **No tab opens for a refused local launch.** A remote launch already has a provisioning placeholder tab by the time the host answers. On a remote refusal that placeholder closes immediately, without showing `provisionError` and without the usual 3-second delay. Other provision failures (ssh errors, clone failures) keep today's display-then-close behavior.
9. **Default remote names are retried over fresh connections.** When the host reports that a default name is running, the placeholder closes, a new launch opens with the next local free name (`claude-2`, or the next pool name), and the whole launch is repeated over a new ssh connection. This allows up to 5 attempts in total. Retries post nothing. Only the final outcome (a refusal after 5 attempts, or a cleanup) is notified.
10. **Profiles skip a clashing entry and keep going.** A profile agent or harness entry that clashes posts the same `Cannot launch …` notification and is skipped, and the remaining entries still open. This is the same reported-and-skipped treatment an unknown tool gets today. The existing relaunch rule, which closes open tabs whose labels match the profile's entries before opening, stays as it is. Leftover cleanup applies as for any launch.
11. **Attach and restore keep their current behavior.** Sessions-tab Attach and `--relaunch` restore bring back an existing session rather than creating one, so they keep `uniqueLabel` suffixing.

### Notification wording

Refusals are posted as `launch-refused` notifications and cleanups as `launch-workspace-cleaned` notifications. Placeholders: `<name>` is the attempted label, `<host>` is the bare host as the sessions tab shows it, `<state>` is the row's state word, `<path>` is the workspace's absolute path on the machine that holds it, and `<reason>` is the underlying error text.

- Open tab: `Cannot launch "<name>": a tab named "<name>" is already open.`
- Sessions row: `Cannot launch "<name>": "<name>" is already in the sessions tab (<state> on <host>).`
- Remote running: `Cannot launch "<name>": "<name>" is already running on <host>.`
- Check unanswered: `Cannot launch "<name>": could not check <host> for an existing "<name>" — <reason>.`
- Removal failed (remote): `Cannot launch "<name>": could not remove leftover workspace "<name>" on <host> (<path>) — <reason>.` For a local removal the ` on <host>` part is left out.
- Harness retries exhausted: `Cannot launch "<first>": "<first>" through "<last>" are already running on <host>.`
- Agent pool retries exhausted: `Cannot launch agent on <host>: 5 names tried (<n1>, <n2>, …) are already running on <host>.`
- Pool exhausted (moved from the transcript, unchanged): `All agent names are in use.`
- Cleanup (remote): `Removed leftover workspace "<name>" on <host> (<path>) before launching.`
- Cleanup (local): `Removed leftover workspace "<name>" (<path>) before launching.`

The old `Agent "<x>" is already active.` line is replaced by the open-tab refusal above.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Agent name parsing and pool selection | `parseAgentCommand`, `resolveAgentName` | `src/agent/commands.ts:52`, `:65` |
| Agent open-tab duplicate refusal (to be replaced) | `newAgentOp`'s `is already active` check | `src/profile/new-agent.ts:20` |
| Harness label assignment (suffixing) | `HarnessManager.open` → `uniqueLabel` | `src/harness/manager.ts:122`, `src/tab/utils.ts:48` |
| Harness command parsing (`as <label>`, `on <address>`) | `parseHarnessCommand` | `src/harness/command-parse.ts:131` |
| Sessions table rows (live, ssh, parked, terminated) | `composeSessionRows`, `SessionsManager.view` | `src/sessions/rows.ts:186`, `src/sessions/manager.ts` |
| Posting a notification | `notify`, `NotificationEventType`, `EXPLICIT_EVENTS`, `notificationText` | `src/notifications/index.ts:33`, `:135`; `src/notifications/format.ts` |
| Launch-failure notification precedent | `notify(..., 'manual', label, 'All agent names are in use.')` | `src/profile/manager.ts:97`, `:133`; `src/profile/entry-openers.ts:27` |
| Remote provisioning entry point | `RemoteServer.provision` | `src/remote/serve.ts:165` |
| Remote peer record written at every remote-serve start | `DetachedPeer.start` → `<root>/.janissary/remote/<session>.json` `{pid, socket}` | `src/remote/serve-detach.ts:41-56`, `src/remote/serve.ts:68-71` |
| Pid liveness for peer records / own instance lock | `isPidAlive`, `isOwnInstanceAlive`, `readLockPid` | `src/instance-lock.ts` |
| Workspace path and clone | `workspacePath`, `provisionWorkspace` | `src/workspace/index.ts` (`export function workspacePath`, `export function provisionWorkspace`) |
| Local workspace creation (sync validation, then async clone) | `WorkspaceManager.create(name)` via `resolveLaunchDir` | `src/workspace/manager.ts:29`, `src/harness/launch-dir.ts:26` |
| Workspace removal (currently swallows errors) | `removeWorkspace`, `untrustWorkspace` | `src/workspace/index.ts` (`export function removeWorkspace`) |
| Remote frame protocol and version history | `ClientFrame`/`ServerFrame`, `REMOTE_PROTOCOL_VERSION = 18`, `SERVER_FRAME_TYPES` | `src/remote/protocol.ts:113`, `:232`, `:313` |
| Server-frame decode (one decoder per frame) | `decodeWorkspaceReady`, `decodeWorkspaceFailed` | `src/remote/frame-decode.ts:115-124`, `:178` |
| Local frame routing for provisioning answers | `ChannelFrame` union; `RemoteChannel` dispatch `case 'workspace-failed'`; entry `onFrame` `case 'workspace-failed'` | `src/remote/channel-types.ts:31`, `src/remote/channel.ts:237-243`, `src/remote/entry-factory.ts:75-85` |
| Per-launch channel callbacks | `onReady` / `onFailed` / `onClosed` handler type | `src/remote/manager.ts:18-20` (no-op instance at `:154`) |
| Provisioning settle funnel (tab-still-open guard) | `wireProvisioning(label, ready, tabExists, onReady, onFailed)` | `src/workspace/provision-wire.ts` |
| Placeholder tab close on provision failure (two copies) | `HarnessManager.failSpawn`; remote-agent failure callback; `PROVISION_FAILURE_CLOSE_DELAY_MS` | `src/harness/manager.ts:281`, `src/profile/remote-agent.ts:59-65`, `src/workspace/provision-wire.ts:6` |
| Remote launch plumbing | `startRemoteLaunch` (its `onClosed` builds `Remote session to <host> ended before its workspace was ready.`), `startRemoteTab`, `startRemoteAgent` | `src/harness/remote-launch.ts:41`, `:84`; `src/profile/remote-agent.ts:35` |
| Profile entry openers (report-and-skip) | `openAgentEntry`, `openHarnessEntry`, called from `openProfileEntries` | `src/profile/entry-openers.ts`, `src/profile/agent-opener.ts:67-68` |
| A split-out `RemoteServer` handler, to keep `serve.ts` under the line limit | `serve-detach-query.ts` answering `capture-request` | `src/remote/serve-detach-query.ts` |

## Proposed changes

1. **New `src/launch-name/` module: the local collision check.** It has one pure function, `checkLaunchName`. It takes the requested name, whether that name is explicit or default, the open tab labels, the sessions rows, and, for a default name, the candidate sequence to walk. The caller reads the rows from `managers.sessions.view()`. That call's `mirror()` is the same idempotent re-record the sessions tab's own reads trigger, and it writes nothing when nothing changed. Compare labels case-insensitively, as `newAgentOp`'s current check does. It returns one of three results:
   - **accept**, with the name to use;
   - **accept with a moved name**, when the name is a default and moved to the next free one (default harness names use the `uniqueLabel` suffix sequence; agent pool names use the next free pool name);
   - **refuse**, with the exact notification text.

   The same module holds the leftover helpers shared with the remote side. Both take only the label and locate everything from `workspacePath(label)`, which both sides have already initialized: locally through `initWorkspaceDir` in `src/state-dirs.ts:75`, and in remote-serve through `initWorkspaceDir(resolved.root)` in `src/remote/serve.ts:265`. The peer-record directory is the `remote` sibling of the workspace base directory, which is `.janissary/remote/`.
   - `isWorkspaceRunning(label, tabUses)` implements decision 3. It returns true if any peer record in that directory has `label` equal to the label and its pid passes `isPidAlive`, if `readLockPid(workspacePath(label))` gives a pid that passes `isOwnInstanceAlive`, or if the caller's `tabUses` predicate says an open tab's `workspaceDir` is that path. Locally that predicate checks open tabs; remote-serve passes a predicate that is always false.
   - `removeLeftoverWorkspace(label)` returns `undefined` on success or the error text. It is a no-op when the folder does not exist. Otherwise it removes the folder and its `.tmp` sibling with `rmSync` without `force`-swallowing (unlike `removeWorkspace`, which ignores errors), and calls `untrustWorkspace`. It does not touch peer records.
2. **Call sites.** All of these route through the module before any tab, clone, or remote spawn:
   - `newAgentOp` (`src/profile/new-agent.ts`), replacing the two transcript lines with notifications;
   - `ProfileManager.newAgentAt` and `newAgentInWorkspace` (`src/profile/manager.ts`);
   - `HarnessManager.open` and `openFromProfile` (`src/harness/manager.ts`), replacing their direct `uniqueLabel` call;
   - `openAgentEntry` and `openHarnessEntry` (`src/profile/entry-openers.ts`, both reached from `openProfileEntries` in `src/profile/agent-opener.ts`). A refusal notifies and then returns a skip result, so the entry is reported and skipped like an unknown tool, while `openProfileEntries` goes on with later entries. `openFromProfile` loses its direct `uniqueLabel` call: a profile entry's `name` is explicit.

   Sessions-tab attach (`src/sessions/attach.ts:68`), restore (`src/sessions/restore-tabs.ts:15`), and `ssh` (`src/ssh-manager.ts:26`) keep calling `uniqueLabel` directly (decision 11).

   For a local `-w` launch, the call site runs the leftover step on the chosen label before `resolveLaunchDir` / `managers.workspace.create`. If `isWorkspaceRunning` is true, the launch is refused (explicit name) or moved to the next candidate (default name), and the check repeats for the new name. If it is not running but the folder exists, `removeLeftoverWorkspace` runs and `launch-workspace-cleaned` is posted. A removal error refuses the launch. A local launch without `-w` skips this step, since it creates no workspace.
3. **Notifications.** Add `launch-refused` and `launch-workspace-cleaned` to `NotificationEventType` (`src/notifications/index.ts:33`) and to `EXPLICIT_EVENTS` (`:90`), so they bypass focus suppression like `manual`. In `notificationText` (`src/notifications/format.ts`), add both to the arm that returns `detail ?? ''`, since the message already carries the full wording. Every call is `notify(managers, <event>, <creator label>, <message>)`, where the creator label is the tab the command was typed in, or the issuing tab for a profile launch.
4. **Peer record carries the label.** Add `DetachedPeer.setLabel(label)` (`src/remote/serve-detach.ts`). It rewrites the record file `start()` already wrote, with the same `{pid, socket}` plus `label`, using the same `writeFileSync(..., { mode: 0o600 })` call. `requestParkedCapture` and `relayPeer`, which read only `pid`/`socket`, need no change. Because the label is written before the clone, a second remote-serve on the same host that provisions the same label afterwards sees a live labeled record and refuses. The window between one process's check and its own `setLabel` is a check-then-act race that is accepted as negligible (two provisions of one label on one host within milliseconds). If it ever matters, the upgrade path is an exclusive `mkdirSync` of the workspace folder as the claim.
5. **Protocol (version 19).** In `src/remote/protocol.ts`, set `REMOTE_PROTOCOL_VERSION` to 19 with a version comment in the existing style, and make these frame changes:
   - A new server frame `name-in-use` with `label`, plus optional `path` and `reason`. With neither optional field, it means the label is running. With both, it means a leftover at `path` could not be removed because of `reason`. Add it to `SERVER_FRAME_TYPES`, give it a decoder in `src/remote/frame-decode.ts` next to `decodeWorkspaceFailed`, and add it to the `ChannelFrame` union (`src/remote/channel-types.ts:31`) and to `RemoteChannel`'s pass-through case list (`src/remote/channel.ts:237-243`).
   - `workspace-ready` gains an optional `cleaned` field holding the removed leftover's absolute path. `decodeWorkspaceReady` accepts it with `optionalNonEmptyString`, the same way it accepts `notice`.

   A peer on an older version is refused at the handshake by the existing version check, so no compatibility shim is needed.
6. **`RemoteServer.provision` checks before cloning.** `src/remote/serve.ts` already has 199 counted lines, so first move the body of `provision` into a new `src/remote/serve-provision.ts`. It becomes a function that receives what it needs from the server (emit, workspaces, peer, and a setter for the provisioned state), split out the way `serve-detach-query.ts` was, and the method stays a one-line delegation. The moved body runs these steps before calling `this.workspaces.create(label)`:
   - If `isWorkspaceRunning(label, () => false)`, emit `name-in-use` `{label}` and return. Nothing is provisioned.
   - If `removeLeftoverWorkspace(label)` returns an error, emit `name-in-use` `{label, path, reason}` and return.
   - Otherwise call `peer.setLabel(label)`, provision exactly as today, and add `cleaned: <path>` to the `workspace-ready` frame when a folder was removed.

   The removal failure travels on `name-in-use` rather than `refuse`/`workspace-failed`, so the local side can tell it apart from a clone failure and close the tab immediately (decision 8).
7. **Local routing of the remote answer.**
   - **Callback:** the per-launch handler type in `src/remote/manager.ts:18-20` gains `onNameRefused(frame)`. The no-op instance at `:154` gets an empty one.
   - **Frame case:** `src/remote/entry-factory.ts`'s `onFrame` gets a `case 'name-in-use'`, shaped like `case 'workspace-failed'`. It marks the entry settled, rejects ready, and calls `handlers.get(label)?.onNameRefused(frame)`.
   - **Refusal error:** `startRemoteLaunch` (`src/harness/remote-launch.ts:41`) turns `onNameRefused` into a rejection of `ready` with a `LaunchNameRefusal` error. That error class is exported from `src/launch-name/` and carries `label`, `host`, and the optional `path`/`reason`.
   - **Cleanup notice:** `onReady` gains the `cleaned` path as a third argument, and `startRemoteLaunch` exposes it the way it exposes `notice()`.
   - **Unanswered check:** in `startRemoteLaunch`'s `onClosed` before settled (the path that builds `Remote session to <host> ended before its workspace was ready.`), the rejection's message is kept for the tab, and the caller additionally posts the check-unanswered refusal with that message as `<reason>`. This is the path an unreachable host or a failed ssh auth takes. A `workspace-failed` (for example a clone failure after the check passed) is not a name check, so it posts nothing new.
8. **One failure funnel for placeholders.** `wireProvisioning` (`src/workspace/provision-wire.ts`) passes the raw error as a second argument to `onFailed`. Existing callers ignore it. The two duplicated placeholder-close paths, `HarnessManager.failSpawn` (`src/harness/manager.ts:281`) and the failure callback in `startRemoteAgent` (`src/profile/remote-agent.ts:59-65`), both delegate to one `failRemoteLaunch` in `src/launch-name/`. That also keeps `src/harness/manager.ts`, currently at 199 counted lines, under the limit. `failRemoteLaunch` does the following:
   - **A `LaunchNameRefusal` for a label that is running, on an explicit name:** notify `launch-refused` and close the tab immediately.
   - **The same for a default name with fewer than 5 attempts:** close the tab immediately and silently, then call the caller-supplied `relaunch(nextName)`. For a harness that re-enters `HarnessManager.open` with the next `uniqueLabel` candidate. For an agent it re-enters `startRemoteAgent` with the next free pool name from `agentNames`.
   - **At the 5th refusal:** notify the retries-exhausted refusal and close.
   - **A `LaunchNameRefusal` carrying `path`/`reason`:** notify the removal-failed refusal and close immediately.
   - **Any other error:** today's behavior. Harnesses set `provisionError` and close after `PROVISION_FAILURE_CLOSE_DELAY_MS`. The remote agent's `out` line plus the same delayed close. When the error is the unanswered-check case above, it also notifies the check-unanswered refusal.

   The attempt number, whether the name is a default, the creator label (for notification attribution), and the `relaunch` callback travel in the launch request that already flows down: `SpawnTabOptions` for harnesses and `RemoteAgentLaunch` for agents.
9. **Order.** The steps land in this order so the tree stays green:
   1. Step 3 (event types).
   2. Step 1 (the module and its pure tests).
   3. Step 2 (local call sites; local behavior complete).
   4. Steps 4–6 (remote side and protocol together, because the frame and its decoder must ship with the version bump).
   5. Steps 7–8 (local routing).
   6. Step 10 (specs).
10. **Specs.** `product/specs/agents.md` and `product/specs/harness.md` (naming and clashes), `product/specs/remote-server.md` (the provision check, the `name-in-use` frame, and leftover cleanup under "Lifecycle and cleanup"), `product/specs/workspaced-agent.md` (local leftover cleanup), `product/specs/profiles.md` (the skipped entry), and `product/specs/notifications.md` (the two new event types).

## Tests

- `src/launch-name/*.test.ts`:
  - The pure check refuses an explicit name that matches an open tab or each live row state, and accepts one that matches a terminated, ssh, or navigator row.
  - A default harness name moves past tabs and rows. A default pool name moves to the next free pool name.
  - `isWorkspaceRunning` is true for a live labeled peer record, a live instance lock, or an open-tab predicate hit, and false for a dead pid or no record.
  - `removeLeftoverWorkspace` removes the folder and the `.tmp` sibling, and returns the error text when removal fails. Use a temp base via `initWorkspaceDir`, as `src/workspace/index.test.ts` does.
  - `failRemoteLaunch` covers each branch of step 8, with fake timers for the delayed close.
- `src/controller.test.ts`: it asserts `Agent "<x>" is already active.` in the transcript today. Update it to expect the `launch-refused` open-tab notification and no transcript line.
- `src/profile/manager.test.ts`:
  - `agent`, the ➕ paths (`newAgentAt`, `newAgentInWorkspace`), and a profile launch each refuse through `launch-refused` without placing a tab or starting a clone.
  - `All agent names are in use.` is now a notification.
  - A local `-w` leftover is removed and `launch-workspace-cleaned` is posted.
- `src/profile/agent-opener.test.ts`: a clashing profile entry is skipped with the notification, and later entries still open.
- `src/harness/manager.test.ts`:
  - `harness claude as foo` with `foo` open is refused.
  - A bare `harness claude` next to an open `claude` and a detached `claude-2` row opens as `claude-3`.
  - A terminated row does not block.
- `src/remote/serve.test.ts`: `provision` emits `name-in-use` `{label}` for a running label, emits `name-in-use` with `path`/`reason` on a removal error, removes a leftover and sets `cleaned`, and writes the label into the peer record before it clones.
- `src/remote/serve-detach-query.test.ts` (where `DetachedPeer` is already exercised): after `setLabel`, the record carries the label, and capture queries still work.
- `src/remote/protocol.test.ts`: `name-in-use` (with and without `path`/`reason`) and `workspace-ready.cleaned` decode, and malformed variants are refused by name.
- `src/remote/channel.test.ts`: `name-in-use` reaches `onFrame`.
- `src/remote/manager.test.ts`: `name-in-use` settles the entry and reaches `onNameRefused`.
- `src/profile/remote-agent.test.ts` and `src/harness/manager-browser-remote.test.ts` (the existing remote-harness launch suite):
  - An explicit `name-in-use` posts a refusal and closes immediately.
  - A default name retries with the next name, silently, and gives up after 5 attempts with one refusal.
  - An early channel end posts the check-unanswered refusal and keeps today's `provisionError`.
  - `cleaned` posts the cleanup notification.
- `src/workspace/provision-wire.test.ts`: `onFailed` receives the raw error as its second argument.
- `src/notifications/format.test.ts`: both new events render their message verbatim.

## Out of scope

- Sessions-tab Attach and `--relaunch` restore keep `uniqueLabel` suffixing.
- No cleanup command or notification action. Cleanup is automatic only.
- A plain process (for example a shell) sitting in a leftover folder is not detected as running.
- Remote hosts other than the launch's target are never queried. A local launch queries no remote host.
- ssh tabs, file navigators, editors, and other tab kinds are unchanged.
- No transcript echo of refusals.

## Verification

`$janissary/scripts/run.mjs check-diff` after each step.

Manual:
1. Open `agent foo` and then `agent foo` again. Confirm the second is refused with `Cannot launch "foo": a tab named "foo" is already open.` in the notifications tab, and nothing in the transcript.
2. Run `harness claude` twice. Confirm the second opens as `claude-2`.
3. Run `harness claude as foo` while `foo` is open. Confirm it is refused.
4. Detach a remote `harness claude as bar on <host>`, then launch `harness claude as bar on <host>`. Confirm the sessions-row refusal.
5. On `<host>`, kill that detached peer's process (leaving its workspace folder and record), forget the row locally, and launch `harness claude as bar on <host>` again. Confirm `Removed leftover workspace "bar" on <host> (<path>) …` and a working tab.
6. From a second janissary instance, run `harness claude as baz on <host>`, then launch the same from the first instance. Confirm `… is already running on <host>.` and that the placeholder closes at once.
7. Repeat step 6 with a bare `harness claude on <host>` while `claude` is running there. Confirm the tab lands as `claude-2`.
8. Create `.janissary/workspace/qux` by hand and run `agent qux -w`. Confirm the local cleanup notification and a working clone.
