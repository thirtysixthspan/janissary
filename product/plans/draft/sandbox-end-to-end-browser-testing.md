# Sandbox end-to-end browser testing

**Complexity: 6/10** — no single hard part, but the surface is wide: one new module, a `REMOTE_PROTOCOL_VERSION` bump carrying two frame changes, a Seatbelt profile carve-in, a notification kind, three launch surfaces including `web/src/`, and the profile save/load round trip. Pre-computing the endpoint (decision 4) removed the async gating that would otherwise have pushed this to a 7. A minimalism pass then cut a second new module (the env merge goes into `scratch-dir.ts`, whose doc comment already describes that job) and a two-hop remote notification path (the `browser-exited` frame reaches `RemoteManager`'s existing `onFrame`, so no `SessionListener` callback and no new bus variant). Two touched files sit within a few lines of the 200-line limit and both are handled up front (§3, §4).

## Summary

An AI working inside a sandboxed `harness` workspace cannot launch a browser, so it cannot see what a user would see. That is not a missing feature, it is the sandbox working as designed: Playwright keeps its downloaded Chromium in `~/Library/Caches/ms-playwright`, and the Seatbelt profile denies reads of `$HOME` contents with no carve-in for that path (`src/sandbox/profile.ts:129`, `src/sandbox/paths.ts:73-78`). A sandboxed agent that tries `chromium.launch()` gets a permission failure, so every UI change it makes has to be verified against React internals or a jsdom tree instead of a rendered page.

`harness <name> -b`/`--browser` closes that gap. Janissary starts a headless Chromium as an ordinary unsandboxed process on whichever host the harness runs on, using Playwright's own `chromium.launchServer()`, and hands the sandboxed harness process two environment variables: `JANISSARY_BROWSER_WS_ENDPOINT`, the websocket endpoint to connect to, and `JANISSARY_PLAYWRIGHT`, the path to janissary's own Playwright client so the versions match by construction and a project that does not depend on Playwright can still drive the browser. The AI writes its own Playwright script, calls `chromium.connect(endpoint)`, and drives a real browser against a real page.

What it points that browser at is the AI's own server. The AI starts the workspace clone's build inside the sandbox, reads that server's own URL and token from its own output, and navigates there. Janissary injects no app URL and no session token into the sandbox, so the agent never touches the janissary window the user is actually working in, and it tests the code it just changed rather than the code the user is running.

This ships connection plumbing and a guidelines document, nothing else. There is no new test-running command and no pass/fail reporting. A new `ai/guidelines/sandbox-e2e-browser.md` teaches any sandboxed AI how to use the two variables.

## Design decisions

1. **Playwright's own `launchServer()` provides the browser.** No browserless, no Docker, no new dependency. `playwright` is already in `package.json:127` and already drives `src/browser/`, and its `launchServer()` starts a Chromium process and returns a websocket endpoint for another process to `connect()` against. An earlier revision of this plan named the browserless product; that revision's open question is settled here (the `browserless` npm package is a Puppeteer client SDK, not a spawnable server, and the real self-hosted product is Docker-only), and this plan is written against `launchServer()` throughout.

2. **The AI serves its own build and points the browser at that.** Janissary hands over the browser and nothing else. The AI runs the workspace clone's own server inside the sandbox, on its own port with its own token, and navigates the connected browser to that localhost URL. The live janissary instance's URL and session token (`src/index.ts:159`) are deliberately never injected: driving the user's own window would create, focus, and close real tabs in the session they are working in, and it would put a live session token in a sandboxed agent's environment for no gain, since the clone renders the same UI. The connected browser runs on the same host as the AI's server in both the local and the remote case, so a `127.0.0.1` URL resolves correctly either way.

3. **Janissary hands over its own Playwright client, not the project's.** `JANISSARY_PLAYWRIGHT` names the resolved entry path of the `playwright` package the janissary server itself is running, and the Seatbelt profile gains a read carve-in for that package directory and for `playwright-core` beside it. Playwright's client and server must be the same version to connect, and a fresh workspace clone has no `node_modules` at all until the AI installs them, so leaving the client to the project would mean the feature works only for projects that happen to depend on the same Playwright release janissary does. Handing over janissary's own copy makes the version match unconditional and makes `-b` useful in a workspace for any project.

4. **The endpoint is computed before the browser starts, so nothing waits on it.** The new module picks a free port itself and mints an unguessable `wsPath` with `makeToken()` (`src/security.ts:5-7`), passes both to `launchServer()`, and returns the endpoint string synchronously. The PTY spawn is never gated on Chromium starting, which is what keeps this feature out of the codebase's async provisioning machinery entirely: no placeholder tab for a flagless launch, no promise that must never reject, no cancellable placeholder entry on the remote side. Two honest costs. A script that connects within the first fraction of a second after launch may need one retry, which the guidelines document names. And a launch that fails outright is reported after the fact through the notifications feed rather than as a notice on the tab's first frame, since the variable is already set by then.

5. **Failures and crashes go to the notifications tab, never the transcript.** A `launchServer()` rejection and an unexpected browser exit are the same event to the user, and both surface as one new notification kind rather than as a line in the harness tab. A remote browser reports the same way: the remote server sends a new `browser-exited` frame, which the local side turns into the identical notification. No supervisor and no restart. Once the browser is gone, `connect()` fails with a plain connection error, and the guidelines document names this as its likely cause. `notify` returns immediately when the notifications tab is closed (`src/notifications.ts:126`, `if (!notificationsTab(managers)) return;`), so a user with that tab closed sees nothing, exactly as they see nothing today for a failed recording. That is the existing contract for this feed and this feature does not carve an exception into it.

6. **No transcript notice about weakened isolation, documented in the specs and user docs instead.** Playwright's own `wsPath` documentation is blunt about it: any process holding the endpoint "can take control of the OS user". A connected client can navigate the unsandboxed browser to `file://` paths and read their content back, so `-b` is a deliberate hole in workspace isolation, not an accident. The flag is a per-launch opt-in and asking for it is the consent, so the tab stays quiet. `product/specs/sandbox.md` and `documentation/user-documentation/` carry the caveat.

7. **Flag `-b`/`--browser`; variables `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT`.** The `JANISSARY_*` prefix follows `JANISSARY_NODE` (`src/sandbox/index.ts:275`). `launchServer()` has no separate token to hand out, and it needs none: the `wsPath` in the endpoint is the credential.

8. **The browser belongs to the tab's `HarnessRuntime`.** `HarnessRuntime` (`src/harness/runtime.ts`) already owns every per-PTY resource and is disposed from one place on PTY exit, tab close, and app shutdown (`HarnessManager`'s bus subscription at `src/harness/manager.ts:34-38`, and `dispose()` at `:41-45`). Adding the browser handle there means teardown is inherited rather than written: closing a `-b` tab kills its PTY, which fires the exit event, which disposes the runtime, which closes the browser. No new label-keyed map and no new line in `src/tab/cleanup.ts`. This is the architecture's principle 2 and 6 applied literally, and it is a change from an earlier revision of this plan, which held the servers in a module-level `label → BrowserServer` map.

9. **One browser per `-b` tab, never shared.** Same per-tab isolation model `BrowserManager` already uses for the `browser` command's browsers. A headless Chromium costs real memory, so a tab that does not ask for one never gets one.

10. **Always headless, no opt-in to a visible window.** The launch options mirror `launchTabBrowser` exactly (`channel: 'chromium'`, `headless: true`, `src/browser/index.ts:68-78`), so `-b` uses the same Chromium build the `browser` command already uses and needs no browser download beyond the existing `playwright:install-chromium` postinstall. The AI driving `-b` never needs to look at a window, unlike a person inspecting a `browser` tab, so this feature adds no `--headed` counterpart.

11. **All three launch surfaces get it.** The `harness` command, the New harness dialog, and profile entries. The dialog builds a command string rather than its own launch payload (`web/src/harness/harness-launch-command.ts`), so a checkbox there is one field and one appended token. A profile entry carries `browser?: boolean`, and `profile save` round-trips it from a new `tab.browser` field the way it already round-trips `offline` and `autoApprove` (`src/profile/save-entries.ts:90-91`).

12. **Every harness supports it.** Unlike `-y`, which is rejected for opencode (`src/harness/command-parse.ts:72-74`), there is nothing harness-specific about handing a process two environment variables, so `-b` adds no rejection branch.

13. **Independent of the workspace, and unconfined off macOS.** A workspace is the default now and `--no-workspace` opts out (`src/harness/command-parse.ts:64-65`), and `-b` works either way. Without a workspace there is no sandbox to escape from, so the isolation caveat in decision 6 is moot rather than worse. On a non-macOS host, Chromium starts and the variables are injected exactly as on macOS; the existing isolation notice already covers the unconfined case for any workspaced tab there.

14. **`-b` with `--offline` is left contradictory on purpose.** `--offline` swaps in the network-denying profile (`src/sandbox/profile.ts:204`), which also blocks the sandboxed process from reaching a local endpoint. No exemption is carved into that profile, and `parseHarnessFlags` does not reject the pair as a usage error. Both flags simply apply, the variables are set, and the connection has no route. The one place this surfaces is a caveat sentence in the guidelines document, so a `connect()` timeout under those two flags reads as expected rather than as a bug.

15. **A remote launch forwards a boolean, not an endpoint.** The `spawn` client frame gains `browser?: boolean`, following the shape `offline` and `harness` already use: a fact the remote acts on itself rather than a value computed locally and shipped over. The remote starts its own browser, builds its own variables, and carves in its own Playwright, exactly as `harnessEnv`'s doc comment already states the general rule (`src/harness/scratch-dir.ts:13-15`). With the `browser-exited` server frame from decision 5, this is two frame changes, so `REMOTE_PROTOCOL_VERSION` moves from 10 to 11 and mismatched ends refuse each other at the handshake.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Launching Chromium through Playwright with the project's chosen channel and flags | `launchTabBrowser`, including the `channel: 'chromium'` rationale | `src/browser/index.ts:68-78` |
| Per-tab flag parsing beside `--no-workspace`/`--offline`/`-y`/`--model`/`--effort`, and its documented complexity headroom | `parseHarnessFlags` | `src/harness/command-parse.ts:55-84` |
| The parsed-command union and the `run` → `open` → `spawnTab` argument chain | `HarnessParsed`; `run`'s call into `open`; `open`'s 9-positional signature | `src/harness/command-parse.ts:8-15`, `src/harness/manager.ts:85`, `:114-117` |
| The struct both launch paths thread options through | `SpawnTabOptions` | `src/harness/spawn-options.ts:7-24` |
| A per-PTY resource owner with one disposal path, reached on PTY exit, tab close, and shutdown | `HarnessRuntime`; the `pty`/`exit` subscription that disposes it | `src/harness/runtime.ts:18-24`, `src/harness/manager.ts:34-38` |
| Where per-machine environment overrides reach a spawned harness, and the documented "the remote builds its own copy" rule | `harnessEnv(name, cwd)`, passed as `extraEnv` | `src/harness/scratch-dir.ts:13-19`, `src/harness/manager.ts:216`, `src/pseudoterminal-manager.ts:26-40` |
| Injecting a `JANISSARY_*` path variable a sandboxed script is expected to use | `JANISSARY_NODE` | `src/sandbox/index.ts:275`, `product/specs/sandbox.md` § Environment scrubbing |
| Carving a package directory outside the workspace into the sandbox's read allow-list, in both literal and realpath form | `SERVER_NODE_DIR_L`/`_R` and `serverNodeDirs`; `packageRootDir`'s "still just `$HOME`-scoped code, not secrets" reasoning; `dualParams`/`clausesFor` | `src/sandbox/index.ts:112-120,153-156,288-289`, `src/sandbox/profile.ts:139-148`, `src/sandbox/paths.ts:207-214` |
| An unguessable per-launch secret generator | `makeToken` | `src/security.ts:5-7` |
| A per-tab, self-managed, unsandboxed browser lifecycle keyed by label | `BrowserManager` and its `closeTab` | `src/browser/tab.ts:15-42`, called from `src/tab/cleanup.ts:30` |
| Adding a notification kind that bypasses focus suppression | `harness-recording-failed` / `ssh-recording-failed` through `notify` | `src/notifications.ts:19-34,44-64,94-112,118` |
| Raising a notification from an inbound remote frame, with the managers already in scope | `RemoteManager`'s `onFrame` closure and its existing `notify` call for a dropped connection | `src/remote/manager.ts:87`, `:200` |
| Additive fields on the `spawn` frame that the remote acts on independently | `offline`, `harness` | `src/remote/protocol.ts:77-87` |
| Where the remote `spawn` frame is assembled, which is **not** `src/harness/remote-launch.ts` | `RemotePtyOptions`, `createRemotePtySession`'s send; the `registerRemotePty` call that builds it | `src/remote/pty-session.ts:8-17,37-40`, `src/harness/manager.ts:215` |
| The remote merging its own machine-specific environment into a PTY spawn | `RemoteProcesses.spawnPty`'s `harnessEnv(frame.harness, …)` | `src/remote/serve-processes.ts:47-64` |
| Forwarding a remote frame that belongs to the tab rather than to one session's I/O | the `workspace-ready`/`workspace-failed`/`transcript` arm handing off to `handlers.onFrame` | `src/remote/channel.ts:184-186` |
| The ceremony a `REMOTE_PROTOCOL_VERSION` bump carries | the version-history comment and the handshake refusal | `src/remote/protocol.ts:7-34`, `product/specs/remote-server.md` § Failures |
| The launch dialog's field set and its command-string builder | `HarnessLaunchFields`, `buildHarnessLaunchCommand`, the `offline` checkbox beside them | `web/src/harness/harness-launch-command.ts`, `web/src/harness/HarnessLaunchDialog.tsx:69-85` |
| A boolean launch flag carried on a profile entry, validated, opened, and saved back | `offline` / `autoApprove` across the four profile files | `src/profile/types.ts:34-41`, `src/profile/schema.ts:71-73`, `src/profile/entry-openers.ts:54-56`, `src/profile/save-entries.ts:90-91` |
| A boolean launch flag recorded on the tab itself | `tab.offline`, `tab.autoApprove`, set in `spawnTab` | `src/tab/types.ts:242-244`, `src/harness/manager.ts:168-169` |

## Proposed changes

Land them in the order below. §1 through §4 are self-contained and leave the tree green on their own. §5 must land as one change: `REMOTE_PROTOCOL_VERSION`, both frame changes, and every consumer of them, since a half-applied protocol change compiles on one end and fails the handshake on the other. §6 through §8 depend only on §3's `SpawnTabOptions` field. This plan depends on no other plan landing first.

### 1. New module `src/browser/e2e-server.ts` — the browser server

Lives in `src/browser/` rather than `src/harness/` because it is browser machinery and because both the local manager and the remote server import it. It holds no label-keyed state; the caller owns what it returns.

Two exports. `startE2EBrowserServer()` returns `{ env, handle }` synchronously enough for the caller to spawn a PTY immediately: it picks a free port by binding a throwaway `node:net` server to port 0 on `127.0.0.1`, reading the assigned port, and closing it; mints a `wsPath` from `makeToken()`; composes the endpoint string from the two; and starts `chromium.launchServer()` in the background with the same options `launchTabBrowser` uses plus that `port` and `wsPath`. `env` is the two-variable object. `handle` exposes `close()`, idempotent and safe before the launch has settled, and takes an `onGone` callback the module invokes once for either a `launchServer()` rejection or an unexpected browser exit, and never after `close()`.

The second export is the Playwright-location resolver §4 describes, memoized on first use since the answer cannot change while the process runs: the entry path `JANISSARY_PLAYWRIGHT` carries, and the two package directories the sandbox carve-in needs. It resolves through `node:module`'s `createRequire`, the stdlib mechanism for asking Node where a package actually is, rather than by walking `node_modules` by hand.

The free-port probe has a small window in which another process could take the port between the probe closing and Chromium binding. Losing it is not silent: `launchServer()` rejects, `onGone` fires, and the user gets the notification from §7.

Every importer is in `src/`, so the imports carry the `.js` extension per the NodeNext rule in `CLAUDE.md`.

### 2. `src/harness/command-parse.ts` — flag parsing

`HarnessParsed`'s launch member gains `browser: boolean`. `parseHarnessFlags` recognizes `-b`/`--browser` with the same single `tokens.some(...)` line `--offline` uses at `:66`, which adds no branching to a function whose own comment already flags it as near the complexity limit. No harness-name restriction and no rejection branch. `parseHarnessCommand`'s doc comment gains a sentence in its existing per-flag style.

### 3. `src/harness/spawn-options.ts`, `manager.ts`, `runtime.ts`, `observers.ts` — ownership and injection

`SpawnTabOptions` gains `browser: boolean`. `run` passes `parsed.browser` into `open`, whose positional list grows from 9 to 10 the way `remote` was added; existing parameters are not reordered, since that struct's own doc comment names transposition as the risk this shape carries. `spawnTab` records it on the tab as `tab.browser`, beside the existing `tab.offline`/`tab.autoApprove` assignments, so `profile save` can read it back (§6).

The browser start and the environment merge do **not** go inline into `finishSpawn`. `src/harness/manager.ts` is at roughly 200 lines under ESLint's `max-lines` counting (`{ max: 200, skipBlankLines: true, skipComments: true }`, `eslint.config.mjs:86`), so it has no room, and the answer per the code guidelines is extraction rather than compaction. The extraction needs no new module: `src/harness/scratch-dir.ts` is 19 lines and its `harnessEnv` doc comment already describes exactly this job, "the environment overrides a harness binary is spawned with, on the machine it runs on" (`:13-15`). It gains a sibling export taking the harness name, cwd, and the `browser` boolean and returning `{ env, handle }`: it calls `harnessEnv(name, cwd)`, and when `browser` is set also calls `startE2EBrowserServer()` and merges the two objects. It must tolerate `harnessEnv` returning `undefined`, which it does for every harness except claude (`:17`, `if (name !== 'claude') return undefined;`). With no browser requested it returns `harnessEnv`'s result and an absent handle, so the non-`-b` path is byte-for-byte what it is today.

`finishSpawn` calls that sibling once, passes `env` where it passes `harnessEnv(name, cwd)` today (`src/harness/manager.ts:216`), and hands `handle` to `harnessRuntime(...)`. The remote's own spawn path calls the same function (§5), which is what makes the "a remote launch builds its own copy on the far side" rule that comment states hold for the browser variables too, rather than being restated in a second place.

`HarnessRuntime` takes the handle as another optional constructor member and closes it in `dispose()`, alongside the reader, recorder, and tailer. `harnessRuntime`'s options type carries it through. Nothing else changes: the existing `pty`/`exit` subscription already disposes the runtime, so tab close, PTY exit, and shutdown all tear the browser down through the path they already use.

For a remote tab, `finishSpawn` starts no local browser at all. It sets `browser` on the `registerRemotePty` options instead (§5).

### 4. `src/sandbox/` — the Playwright carve-in

There is exactly one resolver for "where is Playwright on this machine", and it lives in `src/browser/e2e-server.ts` (§1) because that is the module that already owns Playwright knowledge. It returns the entry path the `JANISSARY_PLAYWRIGHT` variable carries and the `playwright` and `playwright-core` package directories the carve-in needs, in literal and realpath form for the same symlink reason `serverNodeDirs` gives at `src/sandbox/index.ts:146-156`. Both consumers import that one function rather than each resolving Playwright's location for itself.

`paths.ts` gains a `PLAYWRIGHT_DIR` dual param pair alongside the existing `SERVER_NODE_DIR` pair. `index.ts` gains the import and two `dParams` entries beside `SERVER_NODE_DIR_L`/`_R` at `:288-289`, which is about three counted lines against its roughly 192, so it stays inside the limit without an extraction. `profile.ts` adds the two params to the read-allow rule that already lists `SELF_DIR_*` and `SERVER_NODE_DIR_*` (`:139-148`).

Resolving `playwright-core` separately matters: `playwright`'s only runtime dependency is `playwright-core` (`node_modules/playwright/package.json`, `"dependencies": { "playwright-core": … }`), and in a hoisted layout it sits as a sibling rather than nested, so a carve-in of the `playwright` directory alone leaves every internal require denied.

The import direction has a cost worth naming: `src/sandbox/index.ts` sits low in the import graph, so importing `e2e-server.ts` pulls Playwright's client into any process that loads the sandbox module, including `janus remote-serve`. It arrives there anyway through §5's own import, and the local server already loads it through `BrowserManager`, so the ceiling this accepts is tens of milliseconds of startup on the remote. If that ever matters, the upgrade path is splitting the resolver into its own module that imports only `node:module` and `node:path`, with no behavior change.

The carve-in is unconditional rather than gated on `-b`. Gating it would mean threading a new field through `SandboxOptions`, `spawnPty`, `PseudoterminalManager.spawn`, and the remote's spawn path, plus a placeholder value for the unbound case, all to withhold read access to two directories of janissary's own dependency tree. Those directories hold no user data and no credentials, which is the same argument `packageRootDir`'s comment already makes for carving in a whole global `node_modules`. Read-only, and it does not widen anything a `-b` tab would not get anyway.

### 5. Remote support — `protocol.ts`, `pty-session.ts`, `channel.ts`, `serve-processes.ts`, `manager.ts`

`src/remote/protocol.ts`: `REMOTE_PROTOCOL_VERSION` moves from 10 to 11, with a paragraph in the version-history comment in the established style. `ClientFrame`'s `spawn` variant gains `browser?: boolean`, and the frame validation that already type-checks `offline` checks it the same way. `ServerFrame` gains `{ type: 'browser-exited'; id: string }` with its entry in `SERVER_FRAME_TYPES`.

`src/remote/pty-session.ts`: `RemotePtyOptions` gains `browser?: boolean`, destructured and included in the `spawn` frame literal beside `harness` and `offline`.

`src/remote/channel.ts`: one `browser-exited` case added to the arm that already forwards `workspace-ready`, `workspace-failed`, and `transcript` to `this.handlers.onFrame` (`:184-186`). `SessionListener` is **not** extended and no bus variant is added: `RemoteManager`'s `onFrame` closure (`src/remote/manager.ts:87`) already has `this.managers` and already imports and calls `notify` (`:9`, `:200`), so it can raise the notification directly. It resolves which tab to name from the frame's session id, `this.managers.tab.tabs.find((t) => t.harness?.ptyId === frame.id)`, rather than from the channel's own label, because several joined tabs can share one channel (`attach`, `entry.labels`) and the channel label would name the wrong one. A frame arriving for a tab that has already closed is dropped.

`src/harness/manager.ts:215`: the `registerRemotePty` options gain `browser: options.browser`.

`src/remote/serve-processes.ts`: when `frame.browser` is set, `spawnPty` builds its environment through the same `scratch-dir.ts` sibling the local side uses (§3), which starts the browser through the same `startE2EBrowserServer()` (the lifecycle is host-agnostic; only which machine runs it differs), and returns an `Entry` whose `kill` closes the browser as well as the session. `finish`, the exit path, closes it too, so a harness that exits on its own does not leave Chromium running. Its `onGone` sends the `browser-exited` frame. Because the endpoint needs no await (decision 4), `spawn`'s existing synchronous insert into `this.entries` is untouched and there is no kill-before-spawn race to guard.

### 6. Profiles — `types.ts`, `schema.ts`, `entry-openers.ts`, `save-entries.ts`, `tab/types.ts`

`ProfileHarnessEntry` gains `browser?: boolean` with a doc comment in the style of its `offline` neighbour. `ProfileHarnessTabFile` needs no edit: it is derived as `Omit<ProfileHarnessEntry, keyof ProfileTabRuntime> & ProfileTabPresentation` (`src/profile/types.ts:107`), so the on-disk shape picks the field up on its own. `harnessProblems` adds a `checkField(value, 'browser', 'boolean', loc)` line beside `offline`'s. `openFromProfile` passes `entry.browser ?? false` into `spawnTab`, so an entry that omits it behaves exactly as a launch without the flag. `writeHarnessEntry` writes `browser: tab.browser` beside `offline` and `autoApprove`, backed by a new optional `browser` field on `Tab` documented next to `offline`.

No validation branch rejects `browser` for any harness, unlike `autoApprove`'s check at `src/profile/entry-openers.ts:54-56`, for the reason in decision 12.

### 7. Notifications — `src/notifications.ts`, `src/harness/manager.ts`, `src/remote/manager.ts`

One new `NotificationEventType`, `e2e-browser-gone`, listed in `shouldNotify`'s bypass group for the same reason the recording failures are there (the tab it concerns is very often the tab being watched, which focus suppression would discard) and given a line in `notificationText`. Two callers, both of which already exist: `HarnessManager` passes an `onGone` callback down for a local browser, and `RemoteManager`'s `onFrame` raises it for a remote one (§5).

### 8. Launch dialog — `web/src/harness/`

`HarnessLaunchFields` gains `browser: boolean`, defaulting false in `initialFields`. `buildHarnessLaunchCommand` appends `-b` when set, in the positive-flag style `--offline` uses. `HarnessLaunchDialog` gains a checkbox labelled "E2E browser (-b)" after the Offline one. No server change: the dialog submits a command string, so the parser from §2 is the only thing that has to accept it, and `HarnessLaunchView` is untouched.

### 9. Docs

- **`product/specs/harness.md`** — a subsection for `-b`/`--browser` after the auto-approve one: what it starts, the two variables, always headless, one browser per tab, available on every harness, with or without a workspace, on all three launch surfaces, and what happens when the browser dies.
- **`product/specs/sandbox.md`** — the Playwright carve-in under Filesystem policy, `JANISSARY_PLAYWRIGHT` under Environment scrubbing, and a plain statement under Practical consequences that a `-b` tab's connected browser is unconfined and reaches the host filesystem through it, so the flag trades isolation for the ability to see a rendered page.
- **`product/specs/remote-server.md`** — a paragraph for the bump to 11, matching every prior bump's.
- **`documentation/user-documentation/advanced-agents/harness.md`** and **`workspacing.md`** — the user-facing half of the same two points: how to launch with the flag, and that it deliberately opens a path out of the sandbox. Both pages already carry agent sprites, so no new placement is needed.
- **New `ai/guidelines/sandbox-e2e-browser.md`** — the operating manual for a sandboxed AI. How to tell the flag was used (the variables being present); that the client is imported from `JANISSARY_PLAYWRIGHT` rather than from the project's own `node_modules`, and run under `JANISSARY_NODE`; that `chromium.connect(endpoint)` is the call, not `connectOverCDP`, because the endpoint speaks Playwright's own protocol and hands back a `Browser`; that the page to test is a server the AI starts itself in the workspace, reading the URL and token from that server's own output, not the janissary window the user is in; that a connect immediately after launch may need one retry; that a connect failure later in a session usually means the browser died and the notifications tab will say so; and that `-b` with `--offline` leaves the endpoint set but unreachable by design.

### 10. `package.json`

No change. `playwright` is already a dependency and the existing `playwright:install-chromium` postinstall already provides the `chromium` channel build this launches.

## Tests

- `src/harness/command-parse.test.ts` — `-b` and `--browser` in short and long form, combined with the other flags and clauses in any order, accepted for all three harness names with no rejection case, and `-b --offline` parsing cleanly as a pair (decision 14, unhandled rather than refused).
- `src/browser/e2e-server.test.ts` (new) — with the `playwright` module itself replaced via `vi.mock`, so no real Chromium starts in the suite (the closest existing precedent is `src/browser/tab.test.ts:7`, which stubs `./index.js`, the module that wraps Playwright; there is no existing `vi.mock('playwright', …)` to copy, so this is the first): the returned endpoint is well formed and carries the minted `wsPath`; both environment variables are present and `JANISSARY_PLAYWRIGHT` points at a path that resolves; a rejected launch fires `onGone` exactly once and never throws at the call site; `close()` is idempotent and suppresses a later `onGone`.
- `src/harness/scratch-dir.test.ts` (new) — the merge in isolation: with `browser` false the result is exactly `harnessEnv`'s, including `undefined` for a non-claude harness; with it true both variables are present alongside claude's `CLAUDE_CODE_TMPDIR`, and present alone for opencode and codex.
- `src/harness/manager.test.ts` — both variables reach the PTY spawn's `extraEnv` for a `-b` launch and are absent without it; the handle is closed when the runtime is disposed on PTY exit, and a second dispose does not close it twice; a remote `-b` launch starts no local browser and sets `browser` on the remote spawn options instead. This file also carries the `HarnessRuntime` disposal coverage, since there is no `src/harness/runtime.test.ts` today and the runtime is only ever built through the manager.
- `src/sandbox/index.test.ts` — the Playwright params are bound to real directories and appear in the generated profile for every sandboxed spawn, `-b` or not.
- `src/remote/protocol.test.ts` — `browser`'s validation on the `spawn` frame, the `browser-exited` frame round-tripping through the codec, and a version-11 handshake refusing a version-10 peer.
- `src/remote/serve-processes.test.ts` — `frame.browser` starts the remote's own browser and merges its variables; killing the session and a natural exit both close it; a failed launch sends `browser-exited`.
- `src/notifications.test.ts` — `e2e-browser-gone` bypasses focus suppression and renders its line. `src/remote/manager.test.ts` — an inbound `browser-exited` frame notifies against the tab owning that session id, and is dropped when no tab owns it.
- `src/profile/validate.test.ts` — a non-boolean `browser` reports `tabs[N]: browser must be a boolean`, matching the existing assertions there (`:107`, `'tabs[4]: focus must be a boolean'`). `src/profile/save.test.ts` round-trips a `-b` tab's entry beside the `offline`/`autoApprove` case at `:141-149`. There is no `src/profile/schema.test.ts`; `schema.ts` is covered through `validate.test.ts`.
- `web/src/harness/harness-launch-command.test.ts` — the checkbox's field appends `-b` and its absence appends nothing. `web/src/harness/HarnessLaunchDialog.test.tsx` — the checkbox renders, toggles, and is remembered across reopen like the others.
- Manual: see Verification.

## Out of scope

- Any built-in E2E test runner, assertion helper, or pass/fail reporting in the transcript. The AI writes and runs its own script.
- Extending the `browser` command to target this browser, or any new interactive command for driving it. The two variables are the entire surface.
- Injecting the running janissary instance's URL or session token into the sandbox, and anything that would let a sandboxed agent drive the user's live window (decision 2).
- Sharing or pooling one browser across tabs (decision 9).
- A `--headed` counterpart to make the browser visible on the host (decision 10).
- Restarting a browser that died, or any supervision loop (decision 5).
- Carving a network exemption into the `--offline` profile, or rejecting `-b --offline` as a usage error (decision 14).
- Downloading a browser at runtime. Chromium arrives through the existing postinstall, the same way `node-pty` does.
- Restricting `-b` to a subset of harnesses the way `-y` is restricted (decision 12).
- Agent tabs. `agent`, `ProfileAgentEntry`, and the ACP paths get no browser, even though a workspaced agent runs under the same sandbox. This is a harness-tab flag; extending it is a separate plan.
- Reworking `open`'s positional signature into an options object. It grows to 10 parameters here, which is worth doing something about, but not in this change.

## Open questions

None.

## Verification

`./scripts/run.mjs check-diff` after each step.

Manual, local: launch `harness claude -b`, then inside that tab confirm `JANISSARY_BROWSER_WS_ENDPOINT` and `JANISSARY_PLAYWRIGHT` are both set and that a headless Chromium is running on the host. Following the new guidelines document, have the harness install the workspace clone's dependencies, start its own janissary server, connect to the browser endpoint, navigate to that server's URL, and read back rendered page text. Close the tab and confirm the Chromium process is gone.

Manual, failure path: with a `-b` tab open, kill the Chromium process by hand and confirm a line appears in the notifications tab.

Manual, remote: repeat the first check with `on <address>` and confirm the browser starts and stops on the remote host rather than the local one, and that killing it there produces the same notification locally.
