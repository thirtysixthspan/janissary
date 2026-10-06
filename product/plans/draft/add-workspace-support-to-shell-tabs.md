# Add workspace support to shell tabs

**Complexity: 7/10** — a new host-owned plugin capability whose ready handler runs asynchronously after a background clone, with per-tab failure and cancellation, plus a change to how every plugin terminal is confined; it spans the plugin API, tab opening, the shell plugin on both sides, profiles, and the docs-screenshot scripts, but every mechanism underneath (clone, name check, provisioning wiring, terminal adoption) already exists.

A shell tab never gets a workspace of its own today. `zsh` starts in the issuing tab's directory, borrows that tab's clone and confinement when it has one, and runs unconfined in the project otherwise. This feature makes a typed `zsh` open its shell in a fresh sandboxed workspace clone by default, the way `agent` and `harness` already do, with `agent`'s `-w`/`--workspace`, `--no-workspace` and `--offline` flags. The ➕ button and `Cmd+T` keep opening a sibling beside the shell they came from: unsandboxed next to an unsandboxed shell, inside the same sandbox next to a sandboxed one. The launch shell `janus` stays where it is, on the application host with no sandbox.

The point is that a shell you open to do work in should be as isolated as the agents you open. You still get a quick second terminal in the place you already are.

## Design decisions

### Product

1. **The launch shell is unsandboxed.** `janus` opens on the application host, in the project directory, with no workspace, as it does today (`product/specs/shell-tab.md` opening paragraphs; `src/launch-shell.ts`).
2. **Sandbox means workspace clone plus confinement.** A Seatbelt sandbox exists only around a workspace clone: `sandboxSpawn` confines a spawn given a `workspaceDir` and nothing else (`product/specs/sandbox.md`). So "a new sandbox" is a new `git clone` under `.janissary/workspace/<name>/` with the shell confined to it, exactly what `agent -w` provisions, credential injection included.
3. **A typed `zsh` creates a new workspace by default.** "Opening a shell tab via an application command should create a new sandbox by default." It holds wherever `zsh` is typed, a sandboxed tab included. This replaces today's rule, where `zsh` inherits the issuing tab's workspace.
4. **The flags mirror `agent`'s.** `-w`/`--workspace` confirms the default. `--no-workspace` opts out and wins when both are present. `--offline` provisions the clone with the offline sandbox profile, which denies network access, and changes nothing without a workspace, as `agent --offline --no-workspace` changes nothing. Flags match case-insensitively. The feature text's `--sandbox`/`--no-sandbox` were dropped for `agent`'s spelling (user decision).
5. **`zsh <name>` names the tab and its clone.** The words after `zsh` that are not flags form the name, lowercased, as with `agent <name>` (user decision). The name is the tab's label and, for a workspaced launch, the clone folder. A typed name that clashes with an open tab or a live session is refused, a workspaced name must be a single folder name, and a leftover folder under it is removed before cloning, all under `agent`'s rules and with `agent`'s notifications-feed messages (`resolveLocalLaunchName` in `src/launch-name/local.ts`; `product/specs/workspaced-agent.md` § Workspace lifecycle). Without a name the shell is named as today: a free agent-pool name, then `shell`, `shell-2`, and so on once the pool is held.
6. **`zsh … on <address>` is refused.** `on <address>` is lifted out of the words the way `agent` lifts it, then refused with `Remote shell tabs are not supported yet.` and nothing opens (user decision). `zsh` from a remote agent tab is still refused with `A shell tab cannot be opened from a remote tab.`.
7. **An unknown option is refused.** A word starting with `-` that is not `-w`, `--workspace`, `--no-workspace`, or `--offline` is refused with `Unknown option "<word>". Usage: zsh [name] [-w|--workspace|--no-workspace] [--offline]` and nothing opens (user decision). This is stricter than `agent`, where such a word quietly becomes part of the name.
8. **The shell tab opens at once and starts zsh when the clone lands.** A workspaced `zsh` places its tab immediately, busy, the way `agent` places a workspaced agent tab. While the clone runs, the shell's metadata row shows the provisioning flag an agent tab shows: the spinning sync icon titled `Provisioning workspace`, in the workspace mark's place (`provisioningFlag` in `src/tab/view.ts`; `provisioning` in `web/src/shared/tab/flag-display.ts`). The terminal area stays empty. When the clone finishes, zsh starts confined to the clone, at its root, and the flag gives way to the workspace mark (user decision).
9. **Command-bar lines wait for zsh.** A line submitted in the shell's command bar while its clone is still running joins the shell's command queue, with the bar reading `queue >`, and drains once zsh reaches its first prompt, as a line queues behind a busy zsh today (user decision).
10. **➕ and `Cmd+T` follow their source shell.** From an unsandboxed shell they open another unsandboxed shell; from a sandboxed shell they open another shell in the same clone and offline mode. This is today's inheritance, kept for both (user decision). On a shell whose clone is still in flight they do nothing: the ➕ button is disabled and dimmed with the tooltip `Waiting for the workspace`, and `Cmd+T` is ignored (user decision). An agent tab's ➕ differs, joining an in-flight clone at once (`newAgentAt` in `src/profile/manager.ts`).
11. **No repository means no sandbox, not no shell.** With no git repository, or no readable `origin` remote, a typed `zsh` opens an unsandboxed shell exactly as `--no-workspace` would and replies `Shell "<name>" has no workspace: <reason>.` (user decision). `<reason>` is `no git repository found` when there is no repository and `the repository has no "origin" remote` for any failure reading `origin`, never raw git output (user decision). `agent` refuses in this case instead.
12. **An unsandboxed shell never starts inside another tab's clone.** `zsh --no-workspace`, and decision 11's fallback, start where `agent --no-workspace` starts (`unconfinedAgentCwd` in `src/profile/inherited-cwd.ts`): in the issuing tab's directory when that tab is local, unworkspaced, and inside the project checkout, and at the checkout root otherwise (user decision). From the launch origin that is the project directory.
13. **A failed clone closes the tab.** If the clone fails after the tab opened, `Failed to create workspace for "<name>": <reason>` is reported and the shell tab closes itself after `PROVISION_FAILURE_CLOSE_DELAY_MS`, as a workspaced agent tab does (user decision). Closing the tab before the clone finishes cancels the clone, and a clone is removed when its last owning tab closes, both as today (`closeTabResources` in `src/tab/cleanup.ts`).
14. **Success is announced in `agent`'s words.** When the clone lands and zsh starts, `Shell "<name>" ready. (workspace: <shortened clone dir>)` is reported, followed by the existing `sandboxNotice` line when Seatbelt confinement is not actually active (user decision). A launch without a workspace reports nothing, as `zsh` does today.
15. **Late messages go to the notifications feed.** The ready line, the sandbox notice, and the clone-failure line arrive after `zsh` has returned, and a shell tab shows nothing appended to it after its command finishes (`dispatchLineWithOutput` in `src/command/manager.ts` captures only while the command runs). So these three always go to the notifications feed, whichever tab issued `zsh`, and are dropped while no feed is open, like every feed line (user decision). The ready line and the sandbox notice name the new shell as their tab. The failure line names the issuing tab, because the new shell is closing (user decision). Lines known while the command runs, decisions 6, 7 and 11, stay the command's reply.
16. **Profile shell entries stay unsandboxed.** A profile's `zsh` plugin entry opens a shell with no workspace, as `zsh --no-workspace` would, so existing profiles do not start cloning once per saved shell (user decision).
17. **`send` and `queue` wait for zsh too.** Another tab's `send <shell> …` or `queue <shell> …` aimed at a shell whose clone is still running joins that shell's command queue, with the usual confirmations (`→ <shell>: <text>` and `→ <shell> (queued): <command>`), and drains once zsh starts, like lines typed in its own bar (user decision). `schedule … in <shell>` is still refused with `Tab "<label>" cannot run scheduled commands.` until zsh has started, because a schedule types into a terminal that does not exist yet (user decision). If the clone fails, the tab closes and its queued lines go with it, as closing any tab takes its queue.

### Implementation

18. **The host owns provisioning, through a new `launchTab` capability.** Workspace creation, name resolution, leftover cleanup and the clone's lifecycle all stay in the host, which already owns them for agents and harnesses (user decision). The shell plugin asks for a launch and supplies two things: a factory for the tab's first payload, and a ready handler the host runs once the clone lands (user decision). `launchTab` is a new capability rather than an option on `openOrFocusTab`, because a launch never focuses an existing tab (user decision).
19. **The no-repository fallback happens inside the launch.** When the host cannot clone, it launches the tab unconfined and says why in the launch result (user decisions). `WorkspaceManager.create` already answers a missing repository or `origin` synchronously with `{ error }`, so that answer is the check; there is no separate preflight. Falling back is the launch's only behavior; a refusing variant waits for a second caller (user decision).
20. **The host hands the plugin its start directory.** A plugin may not import `unconfinedAgentCwd` (it may not reach two levels into host internals, `ai/guidelines/plugins-tabs.md` § Import boundaries) and must not re-implement it (one definition per rule, `ai/guidelines/architecture-principles.md` § 5). So the launch's factory receives the directory to start in.
21. **`launchTab` returns the opened tab's label.** The plugin needs it for decision 11's reply (user decision).
22. **The plugin writes its own ready lines from host facts.** The ready handler receives the shortened clone directory and the sandbox notice, if any, and posts both with `notifyUser`. The host writes only the generic failure line, whose wording matches `agent`'s (user decision).
23. **Ready-handler failures split by cause.** A `rejectRequest` from the ready handler, or a refused or failed terminal spawn inside it, fails that one tab: decision 13's failure line, then the delayed close. Any other throw or timeout crosses the normal failure boundary and disables the plugin. The handler runs under the 5000 ms budget a user-initiated handler gets (user decisions). This keeps `ai/guidelines/plugins-tabs.md` § Failure boundary true without a carve-out: a rejection already disables nothing, and a spawn refusal already answers one request.
24. **`spawnTerminal` confines only when asked.** The host stops forcing every plugin terminal into its source tab's clone. It confines a terminal when the options' `workspace` names the source tab's own clone or the launching tab's own clone, refuses any other directory, and runs it unconfined when `workspace` is omitted (user decision). This is what the published v1 contract already says ("without one it runs where the plugin said", `documentation/developer-documentation/tab-plugins.md` § API changelog); only the host code disagreed. The shell is the only plugin that spawns terminals.
25. **Siblings open through a `sibling` intent.** ➕ and `Cmd+T` send a plugin intent rather than dispatching the line `zsh`, which now means a fresh clone. No user-visible syntax is added (user decision).
26. **A `profileCommand` declaration field.** Profiles reissue a plugin's declared command generically (`commandTarget` in `src/profile/view-tabs.ts`). A new optional declaration field names the line a profile entry reissues instead; the shell declares `zsh --no-workspace`. Without it a profile reissues `command`, so no other plugin changes (user decision).
27. **The shell payload says when it is provisioning.** The first payload of a workspaced launch carries `provisioning: true` and no terminal; the ready handler replaces it. The client reads it for the spinner, the disabled ➕, the ignored `Cmd+T`, and the queued bar lines. No new client capability (user decision).
28. **The host module is `src/plugins/launch-tab.ts`.** One focused module, wired into the capability object from `src/plugins/context.ts`. `src/tab/openers.ts` gains only a preset label, start directory and workspace on its plugin-tab open (user decision); the confinement rule of decision 24 goes in its own small module so that file stays under the limit.
29. **The plugin API stays at version 1.** `launchTab`, `profileCommand`, and the published provisioning icon are additive; the `sibling` intent is the shell plugin's own and not part of the API. Decision 24 brings the host in line with the documented contract rather than changing it.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| Clone a workspace in the background, cancel on close, refcount, remove on last release | `WorkspaceManager.create` / `preflight` / `cancel` / `release` | `src/workspace/manager.ts` |
| Repository and `origin` checks behind the two fallback reasons | `findRepoRoot`, `getRemoteUrl` | `src/workspace/index.ts` |
| Finish a placed tab once its clone resolves, ignoring a since-closed tab | `wireProvisioning`, `PROVISION_FAILURE_CLOSE_DELAY_MS` | `src/workspace/provision-wire.ts`; used by `startWorkspaceAgent` in `src/profile/new-agent.ts` |
| Name check, workspace-name validation, leftover-folder removal, feed refusals | `resolveLocalLaunchName`; `poolCandidates`, `suffixCandidates` | `src/launch-name/local.ts`, `src/launch-name/check.ts` |
| Docs-screenshot reset and shots that type `zsh` | `SHELL_COMMAND`; `tabs-overview` setup | `scripts/docs-screenshots/reset.mjs`, `scripts/docs-screenshots/manifest.mjs` |
| Where an unconfined launch starts | `unconfinedAgentCwd` | `src/profile/inherited-cwd.ts` |
| Workspace flag parsing to mirror | `splitAgentClauses`, `parseAgentCommand` | `src/agent/commands.ts` |
| Sandbox-inactive notice | `sandboxNotice` | `src/sandbox/index.ts` |
| Feed line attributed to a tab | `notify` | `src/notifications/index.ts` |
| Cancel and release a tab's clone on close | `closeTabResources` | `src/tab/cleanup.ts` |
| Provisioning spinner in the workspace mark's place | `provisioningFlag`; `provisioning` flag entry | `src/tab/view.ts`, `web/src/shared/tab/flag-display.ts` |
| Plugin-tab open with a fixed label, terminal adoption, update path that can spawn | `openPluginTab`, `updatePluginTab`, `withResources` | `src/tab/openers.ts` |
| Plugin capability object and guarded host-to-plugin calls | `createPluginContext`; `invokePlugin`, `PluginCallOutcome` | `src/plugins/context.ts`, `src/plugins/invoke.ts` |
| `spawnTerminal` gating on the declaration | `declaredResources` | `src/plugins/declared-resources.ts` |
| A per-request terminal refusal that leaves the plugin enabled | refusal path pinned by tests | `src/plugins/terminal-refusal.test.ts` |
| Shell open sequence, command handler, intents | `openShellTab`; `activate` | `src/plugins/shell/open-tab.ts`, `src/plugins/shell/activate.ts` |
| Shell payload and guard | `ShellPayload`, `isShellPayload`, `SHELL_PAYLOAD_SCHEMA_VERSION` | `src/plugins/shell/shared.ts`; client literal in `web/src/plugins/registry.tsx` |
| Shell metadata row, ➕ button | `ShellTabMeta` | `web/src/plugins/shell/ShellTabMeta.tsx` |
| `Cmd+T`, command bar, queue | `ShellTab`, `useShellCommandQueue` | `web/src/plugins/shell/ShellTab.tsx`, `web/src/plugins/shell/useShellCommandQueue.ts` |
| Profile reissue of a plugin command | `commandTarget` | `src/profile/view-tabs.ts` |
| Launch shell | `openLaunchShell` | `src/launch-shell.ts` |

## Proposed changes

### Plugin API (`src/plugins/api.ts`, `src/plugins/api-capabilities.ts`)

Add the `launchTab` capability. It takes an instance key, a request, a factory, and a ready handler. The request carries an optional typed `name` and an optional `workspace` holding `offline`. The factory receives the usual `TabPluginResources` plus the launch's start: the resolved label, the directory to start in, and, when a clone is provisioning, its directory. It returns the tab's first payload, as an `openOrFocusTab` factory does. The ready handler receives the instance key, the clone directory, its shortened display form, and the sandbox notice when there is one, alongside the capability object. `launchTab` returns the opened tab's label and, when it fell back, the fallback reason; it returns nothing when the launch was refused. It adds no activation check of its own: a plugin without `spawnTerminal` is already refused the spawn by `declaredResources` in `src/plugins/declared-resources.ts`, which decision 23 turns into a per-tab failure.

Add the optional `profileCommand` declaration field. It needs no validation: `commandTarget` falls back to `command` when it is absent, and declarations are bundled, trusted data.

Document `spawnTerminal`'s `workspace` option as decision 24 states it.

### Host launch (`src/plugins/launch-tab.ts`, new)

One module builds the `launchTab` capability for `createPluginContext`. For one launch, in order:

- Resolve the label. A launch origin keeps its fixed label, as `openOrFocusTab` gives it today (`origin.launch ? { label: origin.label }` in `src/plugins/context.ts`). Otherwise `resolveLocalLaunchName` runs with the issuing tab as `creator`, the typed name with `explicit: true`, and `workspace` set when one was requested. An unnamed launch passes `candidates` as `poolCandidates()` followed by `suffixCandidates(declaration.tabLabelPrefix)`, both from `src/launch-name/check.ts`, so a shell still takes a free pool name and then `shell`, `shell-2`, as `unusedAgentName` and the prefix fallback in `src/tab/creators.ts` name it today. A refusal returns nothing; `resolveLocalLaunchName` has already posted it.
- When a workspace was requested, start the clone under the label with `WorkspaceManager.create`. An `{ error }` answer drops the workspace from the launch and becomes the fallback reason: `create`'s `NO_REPO` answer (the module-private constant in `src/workspace/manager.ts`, exported for this) maps to `no git repository found`, and any other answer to `the repository has no "origin" remote`. `resolveLocalLaunchName` already skips leftover removal when the project cannot clone (`clearLeftover` checks `preflight`), so nothing is deleted on the way to a fallback. The one ceiling, accepted (user decision): a typed name in a project that cannot clone is still held to the single-folder-name rule, although the shell it gets has no folder. Resolving the name a second time without `workspace` would lift that, if anyone ever needs to name a shell `a/b` in a repository-less project.
- Compute the start directory: the clone directory when provisioning, otherwise `unconfinedAgentCwd(creator, managers.tab.cwdOf(creator.label), managers.tab.launchDir)`, or `launchDir` for a launch origin, which has no tab.
- Open the plugin tab under the label with the clone preset as its workspace and offline mode, so cleanup, the provisioning flag, and the name checks all see it from the first moment. Set `tab.plugin.busy`, the field the `setBusy` capability writes, so the strip's dot blinks.
- Wire the clone with `wireProvisioning`, its `tabExists` checking the label. On failure, post `Failed to create workspace for "<label>": <reason>` with `notify(managers, 'manual', <issuing label>, …)`, the event `newAgentAt` uses for its workspace messages, and close the tab after `PROVISION_FAILURE_CLOSE_DELAY_MS` by finding it again by label, as `startWorkspaceAgent` does. On success, clear `tab.plugin.busy` and run the ready handler through `invokePlugin`, with the new tab as the answering label, under the 5000 ms budget. A `rejected` outcome takes the failure path above with the rejection's reason; a `failed` outcome goes to the same failure handling an ordinary handler failure gets, disabling the plugin.

`src/plugins/context.ts` has about 189 lines of code by the `max-lines` count, so its `launchTab` entry is a single delegation into this module, built the way `lineCapabilities` in `src/plugins/line-capabilities.ts` is built and spread in. If the module itself nears 200 lines, label resolution moves to `src/plugins/launch-tab-label.ts` beside it.

### Tab opening (`src/tab/openers.ts`, `src/tab/opening-state.ts`)

`openPluginTab` accepts a preset of fixed label, start directory, and optional workspace. The minted tab takes the preset's `workspaceDir` and `offline` directly; `WorkspaceManager.create` already counted that reference, so no retain happens. When the factory started no terminal, the tab's runtime `cwd` is set to the preset's start directory, the way it is set from `terminalCwd` today, so completion, the metadata row and **open file navigator here** point at the clone from the first moment. A provisioning shell's navigator button stays live, as an agent tab's does while its clone runs (`AgentTabMeta` disables nothing then).

`withResources` stops overwriting the options' `workspace` with the source's. The decision moves to a new pure module, `src/tab/terminal-workspace.ts`, because `src/tab/openers.ts` already has about 173 lines of code. Given the spawn options, the source tab's clone, and the target tab's own clone, it answers the workspace to confine the terminal to, none, or a refusal. A requested directory equal to either clone is honored, an omitted one runs unconfined, and any other directory throws a `TabPluginRejection`, as `spawnPluginTerminal` in `src/tab/plugin-terminals.ts` does for a `cwd` outside the root, so it answers one request and leaves the plugin enabled. `openPluginTab` retains the source's clone only when a terminal was actually confined to it.

### `send` and `queue` targets (`src/tab/plugin-terminals.ts`, `src/commands/send.ts`, `src/commands/queue.ts`)

Beside `ownsTerminal`, add a predicate for a plugin tab that will own a terminal once its clone lands: a plugin tab with a `workspaceDir` for which `WorkspaceManager.provisioning` answers true, the same signal `provisioningFlag` in `src/tab/view.ts` reads. `deliverTo` in `send.ts` and the target check in `queue.ts` accept a tab that satisfies either predicate, enqueueing exactly as they do for a terminal-owning tab and, in `queue.ts`, skipping `drainQueue` for it as they do now. `src/schedule/targets.ts` keeps `ownsTerminal` alone. The shell client drains the lines once zsh starts, through the queue handling below.

### Profiles, the launch shell, and the docs screenshots

`commandTarget` in `src/profile/view-tabs.ts` reissues the declaration's `profileCommand` when present and its `command` otherwise. The declaration lookup it already does for `command` supplies both.

`src/launch-shell.ts` runs `zsh --no-workspace` instead of `SHELL_COMMAND = 'zsh'`.

The docs-screenshot scripts type `zsh` expecting today's unconfined shell. `SHELL_COMMAND` in `scripts/docs-screenshots/reset.mjs` becomes `zsh --no-workspace`, since its comment requires the replacement shell to "start unconfined at the launch directory". Both `zsh` steps in the `tabs-overview` entry of `scripts/docs-screenshots/manifest.mjs` become `zsh --no-workspace`, so the shot's shells open at once and take its `send` lines. `scripts/docs-screenshots/reset.test.mjs` matches the new command text where its fake app answers `zsh` and where it asserts `run:zsh`.

### Shell plugin (`src/plugins/shell/`)

- **Argument parser, new pure module.** It turns the command argument into a name, a workspace flag, and an offline flag, or one of decision 6's or 7's refusals. No I/O, per architecture principle 4.
- **Command handler (`activate.ts`).** It refuses a remote origin as today, then refuses parser errors with `rejectRequest` so the plugin stays enabled. Otherwise it calls `launchTab`. When the result carries a fallback reason, it replies `Shell "<label>" has no workspace: <reason>.` with `note`.
- **Launch, new module beside `open-tab.ts`.** The factory returns the provisioning placeholder when a clone is provisioning. Otherwise it spawns zsh unconfined in the given directory. The ready handler calls `updateTab` with a factory that spawns zsh in the clone's root, confined to the clone, and replaces the placeholder with the full payload. It then posts the ready line and any sandbox notice with `notifyUser`, naming the new tab.
- **Shared spawn.** The terminal spawn and payload construction `open-tab.ts` does today move into one helper that the launch and the sibling both call.
- **Sibling (`open-tab.ts`).** `openShellTab` serves only ➕ and `Cmd+T` now. It passes the origin's workspace explicitly as `spawnTerminal`'s `workspace`, keeping today's directory fallback.
- **`sibling` intent (`activate.ts`).** It answers `{ opened: false }` when the answering shell's payload is still provisioning, and otherwise opens the sibling and answers `{ opened: true }`. Called from an intent, `openOrFocusTab` takes the answering shell as its source, so the sibling lands in its group and the origin's workspace is that shell's.
- **`terminal-status` intent.** A provisioning payload answers running, so a mounted placeholder never closes itself for want of a process.
- **Payload (`shared.ts`).** It gains an optional `provisioning: true`, and `ptyId`, `cols` and `rows` become absent while provisioning. The guard accepts exactly those two shapes. `SHELL_PAYLOAD_SCHEMA_VERSION` goes from 3 to 4, with the client literal in `web/src/plugins/registry.tsx`.
- **Manifest.** It adds `launchTab` and `notifyUser` to `capabilities`, and `profileCommand: 'zsh --no-workspace'`.

### Shell client (`web/src/plugins/shell/`)

- `ShellTabMeta` draws the provisioning flag in the workspace mark's place while `payload.provisioning` is set: `syncIcon`, added to the icon re-exports in `web/src/plugins/api.ts` beside `workspacedIcon`, with the global `tab-flag--provisioning` class and the title `Provisioning workspace`, matching the `provisioning` entry in `web/src/shared/tab/flag-display.ts`. The row disables and dims ➕ with the tooltip `Waiting for the workspace`. ➕ sends the `sibling` intent; an `{ opened: false }` answer is not a failure, so it no longer calls `reportFailure` the way an undispatched `zsh` line does today.
- `ShellTab` sends the `sibling` intent for `Cmd+T` and ignores the chord while provisioning.
- The terminal hooks attach nothing while there is no `ptyId`, and attach when the ready update supplies one.
- `useShellCommandQueue` treats a provisioning shell as busy, so lines submitted in its bar, and lines `send` or `queue` put in its queue, wait and drain from zsh's first prompt.

### Specs and docs

- `product/specs/shell-tab.md`: the `zsh` syntax, the default workspace, flags, naming and refusals in § Where the shell starts; `Cmd+T` in § Keys; the provisioning flag and disabled ➕ in § The metadata row; failure, cancel and feed messages in § Lifetime; and, where it says `send`, `queue`, and `schedule` "share that check so they cannot disagree", that `send` and `queue` also accept a provisioning shell while `schedule` does not.
- `product/specs/workspaced-agent.md`: a "Workspace shell tab" subsection beside the harness one.
- `product/specs/tab-plugins.md`: `launchTab`, `profileCommand`, and `spawnTerminal`'s confinement rule.
- `product/specs/profiles.md`: a `zsh` entry opens without a workspace.
- `documentation/developer-documentation/tab-plugins.md`: the declaration table, the capability reference, and v1 changelog entries.
- `documentation/user-documentation/command-bar/shell.md` and `commands.md`: the new usage.

### Implementation order

Each step keeps `check-diff` green.

1. The confinement module and the `withResources` change, together with `openShellTab` passing the origin's workspace explicitly. Landing either half alone runs ➕ siblings of a workspaced shell unconfined.
2. The `launchTab` and `profileCommand` API, the `send` and `queue` target predicate, the `openPluginTab` preset, `src/plugins/launch-tab.ts` with its tests, and `commandTarget` reading `profileCommand`. No plugin declares or calls either yet, so nothing changes for users.
3. The shell plugin, server and client together, with `src/launch-shell.ts` and the docs-screenshot scripts. This is the step where bare `zsh` starts cloning, so the launch shell's `--no-workspace`, the manifest's `profileCommand`, and the `sibling` intent the client's ➕ and `Cmd+T` now send must all land in it; any one left out makes `janus`, a profile shell, or a ➕ sibling clone. The schema bump and the client literal in `web/src/plugins/registry.tsx` also change together here.
4. Specs and docs.

## Tests

- **Parser** (new test beside the parser in `src/plugins/shell/`): default workspace; `-w`, `--workspace` and `--no-workspace` with case-insensitivity and the `--no-workspace`-wins rule; `--offline`; multi-word names lowercased; `on <address>` refused; unknown options refused with the usage line.
- **Host launch** (`src/plugins/launch-tab.test.ts`, new, with the stub managers `src/plugins/terminal-refusal.test.ts` uses): a workspaced launch places a busy tab with its `workspaceDir` before the clone resolves; both fallback reasons open unconfined at the `unconfinedAgentCwd` directory; a typed-name clash returns nothing; a launch origin keeps `janus`; pool exhaustion names `shell`; clone failure posts the line and closes after the delay; closing mid-clone cancels and never runs the ready handler; a rejecting ready handler closes only its tab; a throwing ready handler disables the plugin.
- **Confinement** (`src/tab/terminal-workspace.test.ts`, new, for the pure rule; plus cases in `src/plugins/terminal-refusal.test.ts`, whose stub managers already carry `workspace.retain`): an omitted `workspace` runs unconfined from a workspaced source and retains nothing; the source's own clone is honored and retained; the target's own clone is honored; any other directory is refused without disabling the plugin.
- **Shell activation** (`src/plugins/shell/activate.test.ts`): command routing to `launchTab`, the fallback reply, parser rejections leaving the plugin enabled, the `sibling` intent in both states, `terminal-status` while provisioning, and the ready handler's update and feed lines.
- **`send` and `queue` targets** (`src/commands/send.test.ts`, `src/commands/queue.test.ts`, and `src/commands/schedule.test.ts`, which already pins the `cannot run scheduled commands` refusal): a provisioning plugin tab is enqueued with the usual confirmation by `send` and `queue` and refused by `schedule … in`; a plugin tab with neither a terminal nor a provisioning clone is still refused by all three.
- **Payload guard** (`src/plugins/shell/shared.test.ts`): both payload shapes accepted, mixed shapes rejected.
- **Profiles** (`src/profile/view-tabs-shell.test.ts` for the shell entry, `src/profile/view-tabs.test.ts` for a plugin without `profileCommand`): `profileCommand` is reissued when declared and `command` otherwise.
- **Docs screenshots** (`scripts/docs-screenshots/reset.test.mjs`): the reset types `zsh --no-workspace`.
- **Client** (`web/src/plugins/shell/ShellTab.test.tsx`): the provisioning flag and dimmed ➕ with its tooltip; ➕ and `Cmd+T` sending `sibling` and doing nothing while provisioning; bar lines queued while provisioning.

## Out of scope

- Remote shell tabs (`zsh … on <address>`), a separate backlog entry. This version refuses the form (decision 6).
- Changing the launch shell's sandboxing.
- Workspaced shells in profiles: a profile entry cannot ask for a workspace (decision 16).
- Tab completion of `zsh`'s flags; `agent`'s flags have none either.
- A refusing variant of `launchTab` for a plugin that would rather fail than fall back (decision 19).
- Joining an in-flight clone from a provisioning shell's ➕ (decision 10).

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Manual, in a checkout with an `origin`: type `zsh` in `janus` and confirm a shell tab opens at once with the spinning `Provisioning workspace` flag, a dimmed ➕ titled `Waiting for the workspace`, and a bar that queues a typed `pwd`. Confirm that when the clone lands, zsh starts in `.janissary/workspace/<name>/`, the queued `pwd` runs, the flag becomes the workspace mark, and the notifications feed shows `Shell "<name>" ready. (workspace: …)`.
- Press ➕ in that shell and confirm the sibling shares the clone. Close both and confirm the clone folder is removed.
- Press ➕ in `janus` and confirm the new shell has no workspace mark and starts in the project directory.
- Type `zsh --no-workspace` in the workspaced shell and confirm the new shell starts at the checkout root, unconfined.
- Type `zsh docs` and confirm the tab and clone are named `docs`. Type `zsh docs` again and confirm the clash refusal in the feed. Type `zsh --bogus` and `zsh x on devbox` and confirm each refusal.
- Close a provisioning shell immediately and confirm the clone stops and no ready line appears.
- While a new shell is provisioning, run `queue <name> pwd` from `janus` and confirm `→ <name> (queued): pwd`, then confirm `pwd` runs once zsh starts; run `schedule … in <name>` and confirm it is refused.
- In a directory with no git repository, type `zsh` and confirm `Shell "<name>" has no workspace: no git repository found.` and an unconfined shell.
- Launch a profile holding a `zsh` entry and confirm its shell has no workspace.
