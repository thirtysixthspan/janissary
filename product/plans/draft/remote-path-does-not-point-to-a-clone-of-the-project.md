# Remote path does not point to a clone of the project

**Complexity: 8/10** — `janus remote-serve` stops resolving its root at startup and settles it on the first `provision` or `attach` instead, which reorders peer start, config loading, and the handshake. Four new or changed frames carry a clone offer, its answer, a structured refusal, and the cloned notice (protocol v21). The local side intercepts the placeholder's keystrokes to answer the offer. A cross-process lock and a cancellable, token-credentialed clone run on the remote, and the remote's workspace clone starts using the forwarded GitHub token too.

A remote launch (`harness claude on <host>`, `agent <name> on <host>[:path]`) only works when the remote path is already a clone of the project repository with an `origin` remote. When it isn't, the launch fails with a message that hides the cause: `Cannot launch "fariz": could not check thecandykingdom for an existing "fariz" — Remote session to thecandykingdom ended before its workspace was ready.` The user can't tell that the fix is to put a clone on the host. This feature checks that the remote holds a clone of *this* project. When the clone is missing, it offers to create one using this machine's GitHub credential, so a fresh host with no GitHub access of its own becomes usable from inside janissary. Every other root failure reports its real reason.

## Design decisions

### Established by the code and the feature text

- **Why the real error is lost today.** `runRemoteServer` in `src/remote/serve.ts` resolves the remote root before anything else. On failure it writes a `workspace-failed` frame and exits with code 1, before it has written the handshake line. The local `RemoteChannel` (`src/remote/channel.ts`) is still in its `authenticating` terminal phase, so it passes that frame to the tab's terminal as raw text. Then ssh exits, `remoteChannelClosed` (`src/remote/manager-closed.ts`) rejects readiness with "ended before its workspace was ready", and `startRemoteLaunch` (`src/harness/remote-launch.ts`) turns that into a `LaunchCheckUnanswered`. That produces the `could not check <host>` notification. The actual reason, such as `<path> is not a git repository.` or `No git repository found at or above <dir>.`, never reaches the notifications feed.
- **Check for the correct clone.** Per the feature text, the remote must hold a clone of *this* project, not just any git repository. Today `resolveRemoteRoot` (`src/remote/serve-root.ts`) only checks for a `.git` entry and an `origin` remote. It never compares that origin with the local project's origin.
- **Offer to clone when missing, into a subdirectory of a home directory.** These come from the feature text.
- **Remote clones don't use any forwarded credential today.** The remote's workspace clone (`provisionRemoteWorkspace` in `src/remote/serve-provision.ts` → `WorkspaceManager.create` → `provisionWorkspace` in `src/workspace/index.ts`) runs `git clone <origin>` with only the remote host's own git access. The forwarded GitHub token on the `provision` frame is applied only afterwards, to the workspace's processes. So a host with no GitHub access of its own can't clone a private repository even once a root exists.

### Product decisions

- **When the clone is offered.** The offer is made in exactly three cases:
  - **The address names a path that does not exist** (`on host:/srv/proj` with no `/srv/proj`). The clone creates it, along with any missing parent folders.
  - **The address names no path, and the walk-up from the ssh login directory finds no clone of this project** (`on host`). That covers finding no git repository at all, and finding one whose `origin` is a different repository, such as a home directory kept as a dotfiles repository. The target is the remote user's home directory, even when the login directory is somewhere else.
  - **The address names the remote user's home directory** (`on host:~`, or its absolute form), which exists and isn't a git repository. It's treated exactly like the no-path case.
- **When it isn't offered.** These cases fail the launch with the host's real reason and provision nothing: an explicit path that exists but isn't a git repository (other than the home directory), a repository with no `origin` remote, and an explicit path whose repository has a different `origin`.
- **A home directory gets a subdirectory.** When the target is the home directory, the clone goes into `~/<repo-name>`. The repo name is the origin URL's last path segment without `.git`. For example, `git@github.com:thirtysixthspan/janissary.git` clones into `~/janissary`. When no usable folder name can be derived from the URL (no path segment, or one that isn't a single folder name), nothing is offered and the launch fails with the real reason.
- **A home-directory target finds an earlier clone first.** Before offering, a launch whose target is the home directory looks for `~/<repo-name>`. When that folder is a clone of this project, the launch is rooted there with no question asked, so after one accepted offer every later `on host` launch just works. When `~/<repo-name>` is an empty folder, the offer is made and the clone goes into it. When it's a non-empty folder that isn't a clone of this project, the launch fails with the real reason and nothing is offered.
- **"This project" means the same repository over any transport.** Two origins match when they name the same host, owner, and repository. SSH scp form (`git@github.com:o/r.git`), `ssh://` form, and HTTPS form are equivalent. Host comparison ignores case, and a trailing `.git` is ignored. Exact string matching would reject real clones, because workspace clones already rewrite their origin to HTTPS (`finishProvisioning` in `src/workspace/index.ts`).
- **Clones on the remote use this machine's GitHub credential.** The credential is the project's scoped `.janissary/github-token`, which already travels to the remote on the `provision` frame (`product/specs/remote-server.md`, the paragraph on the forwarded GitHub token). Both remote clones use it: the new root clone, and every remote workspace clone. It's used only when the origin's host is `github.com`, so a GitHub token is never sent to another host. The clone then fetches the origin's HTTPS form. When no token is configured locally, or the origin isn't on GitHub, the clone uses the origin as-is with the remote host's own git access, exactly as today. The token is never written to the remote filesystem, never placed in a URL, and never stored in either clone's git config. This machine's other git credentials, such as the local credential helper or SSH keys, aren't used.
- **The question is asked in the placeholder tab's terminal.** It's a y/n prompt in the same terminal where ssh's password, passphrase, and host-key prompts already render. There's no modal and no question panel. This keeps the rule from `product/specs/remote-server.md` ("Authentication") that the placeholder terminal is the only prompt mechanism for a launch. It works the same for a harness placeholder and for an agent placeholder, whose ssh takeover (`activePty` in `src/profile/remote-agent.ts`) lasts until the workspace is ready.
- **Prompt wording and keys.** Terminal lines leave out the host, since the tab's host chip already shows it. `<url>` is the URL that will actually be cloned: the HTTPS form when the token applies, otherwise the origin as-is. For a missing path the prompt reads `<path> is not a clone of this project. Clone <url> into <path>? [y/N] `. For a home-directory target it reads `<home> has no clone of this project. Clone <url> into <home>/<repo-name>? [y/N] `. `y` or `Y` clones. `n`, `N`, Enter, Escape, or Ctrl-C declines. Any other key is ignored and the prompt stays up. The accepted or declining key is echoed as `y` or `n`, followed by a newline.
- **The clone runs silently.** Like a workspace clone today, git's own progress and error output isn't streamed into the placeholder terminal. While it runs, the terminal shows one status line, `Cloning <url> into <path>…`. When it fails, git's first error line becomes the failure's reason.
- **A successful clone is announced.** Once the workspace is ready, `Cloned <url> into <path> on <host>.` is posted to the notifications feed. It's attributed to the launch's creator, the same way as the existing `Removed leftover workspace …` line.
- **Concurrent launches share one prompt and one clone.** Two launches can reach the same missing target on the same host at the same time, such as two tabs from one profile. Only the first shows the prompt. It takes a lock on the target when the prompt is shown and holds it through the clone. The other launch waits silently through the question and the clone, then uses the result without asking. If the first launch is declined, cancelled, or its clone fails, the waiting launch asks for itself.
- **Cancel and failure clean up only what the clone created.** Closing the placeholder tab, or losing the ssh session, while the prompt is up counts as declining. Doing so while the clone runs kills git. A cancelled or failed clone removes the folder it created. For an empty `~/<repo-name>` that already existed, it removes that folder's contents and leaves the folder. Nothing that existed before the clone is touched.
- **A root failure reports its real reason.** It appears in the placeholder before it closes and in the notifications feed, attributed to the tab the launch was typed in (or a profile launch's issuing tab). `<path>` in the declined and clone-failed lines is the folder the clone would have gone into, which for a home-directory target is `<home>/<repo-name>`.
  - Declined: `Cannot launch "<name>": <path> on <host> is not a clone of this project — clone declined.`
  - Clone failed: `Cannot launch "<name>": cloning <url> into <path> on <host> failed — <reason>.`
  - Different origin: `Cannot launch "<name>": <path> on <host> is a clone of <other-url>, not <this-url>.`
  - Existing path that isn't a repository (other than home): `Cannot launch "<name>": <path> on <host> is not a git repository.`
  - Occupied `~/<repo-name>`: `Cannot launch "<name>": <path> on <host> exists and is not a clone of this project.`
  - No origin: `Cannot launch "<name>": <path> on <host> has no "origin" remote.`
  - No usable repo name for a home target: `Cannot launch "<name>": cannot name a folder for <url> under <home> on <host>.`
  - Missing path when the local project has no origin to offer: `Cannot launch "<name>": <path> on <host> does not exist.`
  - No repository above the login directory when the local project has no origin to offer: `Cannot launch "<name>": no git repository found at or above <dir> on <host>.`

### Implementation decisions

- **The offer runs after the handshake, over frames.** `janus remote-serve` no longer resolves its root at startup. It writes the handshake at once, and the root is settled by the first frame that needs one:
  - **`provision`** classifies the root with the local origin it now carries. That either uses a root, offers a clone, or refuses.
  - **`attach`** resolves the root by today's rules (the address's path, else the walk-up), with no origin comparison and no offer. It answers `attach-result` with `accepted: false` when there's no root, since a parked peer's record can't exist without one. That is the same answer a missing session gets today.
- **Everything that needs the root waits for it.** `loadConfig`, `loadProjectTokens`, `loadGitIdentity`, `initWorkspaceDir`, the `WorkspaceManager`, and `DetachedPeer.start` all run once the root is settled, before provisioning continues to the label check. They run in the same order they do today in `runRemoteServer`. Until the peer has started, frames are written straight to stdout (the existing `writeFrame`), because there's no peer to route them through yet.
- **Before the root is settled:** `session-state` answers an empty list, as it already does before provisioning. Frames that need a workspace are refused by the existing `requireWorkspace`. Losing the transport (stdin ending, or `SIGHUP`) ends the process instead of parking it: there's no peer to park, so it cancels a pending offer or clone, removes the partial clone, releases the lock, and exits.
- **The handshake stops carrying the root.** The root isn't known when the handshake is written. `RemoteHandshake.root` and the `root` argument to `encodeHandshake` go away. Nothing on the local side reads it: `parseHandshake` in `src/remote/protocol.ts` already defaults it to `''`, and no caller uses the field.
- **New and changed frames (protocol version 21).** `REMOTE_PROTOCOL_VERSION` moves from 20 to 21, with a comment paragraph in the existing style. A version-20 remote resolves its root before the handshake and never offers, so it's refused at the handshake like every other mismatch.
  - `provision` gains an optional `origin`: the local project's origin with any embedded credentials removed.
  - A new server frame, `clone-offer`, carries `path` (the clone target), `url` (the URL that will be cloned), and an optional `home` (present when the target is `<home>/<repo-name>`, for the prompt wording).
  - A new client frame, `clone-answer`, carries `accept` (a boolean).
  - A new server frame, `root-refused`, carries a structured `refusal`: a kind, `path`, and depending on the kind, `url`, `other`, or `reason`. It's a frame of its own, the way `name-in-use` is, so the local side can compose the sentence with the tab's name and the host alias. The remote knows neither.
  - `workspace-ready` gains an optional `cloned` record (`url`, `path`), like `cleaned`.
- **The local side intercepts the placeholder's keystrokes once the handshake lands.** Keys typed into the placeholder reach the ssh PTY directly through `PseudoterminalManager.input` (`src/pseudoterminal-manager.ts`). Before the handshake that's correct, because they answer ssh's own prompts. After it, they would be written into the framed stream. `spawnTransport` gains an optional input handler in its `handlers` argument, and `input(id, data)` hands a transport's keystrokes to that handler instead of writing them. The remote entry's handler passes keys to ssh while the channel is authenticating. Once the channel is attached, it gives keys to a pending offer and drops everything else. So stray keys can no longer reach the framed stream.
- **The prompt is drawn locally.** On `clone-offer`, the entry writes the prompt into the placeholder terminal through the same bus event pre-handshake terminal text already uses (`onTerminalData` in `src/remote/entry-factory.ts`, a `pty` `data` event for the transport's id). On an answer, it echoes the key. On accept it also writes the `Cloning …` line, then sends `clone-answer`.
- **Cancel reaches the remote through existing paths.** Closing the placeholder releases its channel, which sends `shutdown` (`RemoteChannel.finish`). A dropped transport raises `SIGHUP` on the remote. Both end in `RemoteServer.shutdown`, which now also cancels a pending offer: an unanswered prompt counts as declined, a running clone is killed and its partial folder removed, and the lock is released.
- **The token reaches git through the child's environment, not its arguments.** `git clone` runs with the inherited credential helpers cleared (`-c credential.helper=` with an empty value, the reset `finishProvisioning` already explains in its comment). It then gets a one-line inline credential helper, passed as a second `-c credential.helper=…`, that answers with username `x-access-token` and a password read from an environment variable set only on that child. `GIT_TERMINAL_PROMPT=0` is set too, so a rejected token fails the clone instead of hanging it on a prompt. Nothing about the token lands in the clone's `.git/config` or the process argument list.
- **Repository-URL helpers move to a new `src/git/repository-url.ts`.** `toHttpsUrl` moves there from `src/workspace/index.ts`, and the new pure helpers join it. `githubCommitsUrl` in `src/github-url.ts` already tells whether a normalized origin is on `github.com`. Its host test moves into a shared `isGitHubUrl` in the same module, so the credential rule and the commits-page link use one check.
- **One cancellable `git clone` helper serves every clone.** The spawn-and-wait inside `provisionWorkspace` is extracted into a shared helper that takes an optional GitHub token and whether to keep stderr. A local `-w` clone passes no token and ignores stderr, so its behavior doesn't change. The remote workspace clone passes the forwarded token. The root clone passes the forwarded token and keeps stderr, so it can report git's first error line.
- **The remote side is split by concern.** `serve-root.ts` classifies the root. A new `serve-root-lock.ts` owns the lock file. A new `serve-root-offer.ts` runs the lock, the offer exchange, and the clone. A new `serve-root-settle.ts` runs the root-dependent setup once a root is known. `serve.ts` dispatches the frames and sequences these.
- **The lock lives under the remote user's `~/.janissary/`.** There's one lock file per target, named by a hash of the target's absolute path, holding the holder's pid. It's created exclusively. A lock whose pid is dead is taken over. A waiter polls it, and when it's released the waiter classifies the target again before deciding whether to offer.
- **The local origin comes from `WorkspaceManager`.** It already resolves the project root's origin in its private `originUrl()` (`src/workspace/manager.ts`, used by `preflight`). A public `origin()` returning the URL, or `undefined` when there is no repository or no `origin`, exposes it without a second lookup path.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Remote root resolution and its failure messages | `src/remote/serve-root.ts` (`resolveRemoteRoot`, `withOrigin`) | Becomes the classifier; its checks stay and gain the origin comparison and home handling |
| Remote server startup, dispatch, shutdown | `src/remote/serve.ts` (`runRemoteServer`, `RemoteServer.listen`, `dispatch`, `shutdown`, `detach`, `requireWorkspace`) | Handshake first, root settled on `provision` or `attach`, offer cancelled on shutdown |
| Remote provisioning | `src/remote/serve-provision.ts` (`provisionRemoteWorkspace`) | Runs after the root is settled; passes the forwarded token to the workspace clone |
| Detached peer | `src/remote/serve-detach.ts` (`DetachedPeer`, `relayPeer`) | Started once the root is known instead of before the handshake |
| Handshake and version check | `src/remote/protocol.ts` (`encodeHandshake`, `parseHandshake`, `RemoteHandshake`, `REMOTE_PROTOCOL_VERSION`) | Loses `root`; the version moves to 21 |
| Frame unions and decoders | `src/remote/protocol.ts` (`ClientFrame`, `ServerFrame`, the frame-type registry), `src/remote/frame-decode*.ts` | New frames decoded in their own `frame-decode-*.ts`, as the others are |
| Channel frame routing | `src/remote/channel.ts` (`dispatch`), `src/remote/channel-types.ts` (`ChannelFrame`) | Routes `clone-offer` and `root-refused` to the entry |
| Channel entry | `src/remote/entry-factory.ts` (`createRemoteEntry`, `onAttached`, `onFrame`, `onTerminalData`) | Sends `origin` on `provision`, draws the prompt, maps the refusal |
| Transport PTY input | `src/pseudoterminal-manager.ts` (`spawnTransport`, `input`) | Gains an optional input handler for transports |
| Launch state and failure funnel | `src/harness/remote-launch.ts` (`startRemoteLaunch`, `startRemoteTab`), `src/launch-name/fail-remote.ts` (`failRemoteLaunch`, `reportRemoteCleanup`), `src/profile/remote-agent.ts` | Routes the new refusal error and the cloned notice for both harness and agent launches |
| Notification wording in one place | `src/launch-name/messages.ts` | Hosts the new `Cannot launch …` and `Cloned …` lines |
| Notification kinds | `src/notifications/index.ts`, `src/notifications/format.ts` | New `launch-root-cloned` kind, next to `launch-workspace-cleaned` |
| Forwarded GitHub token | `provision.tokens.github` (`src/remote/protocol.ts`), `getProjectTokens` (`src/project/tokens.ts`) | The credential for both remote clones; nothing new is forwarded |
| Origin lookup, HTTPS normalization, workspace clone | `src/workspace/index.ts` (`getRemoteUrl`, `toHttpsUrl`, `provisionWorkspace`), `src/workspace/manager.ts` (`create`, `originUrl`) | `toHttpsUrl` moves; the clone spawn is extracted; `create` passes an optional token through |
| GitHub host test | `src/github-url.ts` (`githubCommitsUrl`) | Its host match becomes the shared `isGitHubUrl` |
| Pid liveness and a bare-pid lock file | `src/instance-lock.ts` (`isOwnInstanceAlive`, `acquireLock`) | The root lock's liveness probe and file format |
| Home-relative path expansion | `src/paths.ts` (`expandUserPath`) | Recognizing `~` targets |
| Single-folder-name check | `src/workspace/label.ts` (`workspaceLabelError`) | Validates the derived repo name before it becomes a folder |

## Proposed changes

### Repository URLs (`src/git/repository-url.ts`, new)

- `toHttpsUrl` moves here unchanged. `src/workspace/index.ts` and `src/github-url.ts` import it from the new module, and its tests move with it.
- `isGitHubUrl(url)`: true when `toHttpsUrl(url)` is an `https://github.com/<owner>/<repo>` URL. It's the host match `githubCommitsUrl` does today, which then calls this helper.
- `sameRepository(a, b)`: true when both URLs name the same host, owner, and repository. It normalizes each through `toHttpsUrl`, then parses it with Node's `URL`, which already lowercases the host and exposes the path. It compares host and path, ignoring a trailing `.git` and a trailing slash. A URL that `URL` can't parse matches only an identical string.
- `repositoryName(url)`: the last path segment without `.git`, or `undefined` when there isn't one or it fails `workspaceLabelError`.
- `withoutCredentials(url)`: parsed with Node's `URL` when it has a scheme. For `http:` and `https:`, both `username` and `password` are cleared, because a token often sits in the username alone (`https://<token>@github.com/…`). For `ssh:` only `password` is cleared, since the username is the ssh login (`git`), not a secret. The scp form (`git@host:o/r.git`) carries no password and passes through as is. The origin now travels inside a JSON frame rather than a shell command, so no character-set restriction applies.

### Shared clone (`src/git/clone.ts`, new)

- `startGitClone(url, target, options)` spawns `git clone` without a shell and returns `{ ready, cancel }`, the same shape `ProvisionHandle` has today. `options.githubToken`, when set and `isGitHubUrl(url)` is true, switches the URL to `toHttpsUrl(url)` and supplies the token as described under "The token reaches git through the child's environment". `options.keepStderr` keeps git's stderr. `ready` rejects with git's first non-empty stderr line when stderr is kept, or with `git clone exited with code <n>` otherwise. `cancel` kills the child.
- `provisionWorkspace(name, url, githubToken?)` in `src/workspace/index.ts` uses it with stderr ignored. `finishProvisioning` is unchanged: it already rewrites the workspace's origin to HTTPS and installs the `gh` credential helper for later pushes.
- `WorkspaceManager.create(name, githubToken?)` passes the token through. The two local callers, `src/harness/launch-dir.ts` and `src/profile/new-agent.ts`, pass none.

### Remote root classification (`src/remote/serve-root.ts`)

- `resolveRemoteRoot(argument, origin?)` returns one of three outcomes: use `{ root }`, offer `{ offer: { target, url, home? } }`, or refuse `{ refusal }`. The walk-up, `expandUserPath`, the `.git` check, and the `origin` check stay as they are.
- With `origin` given, an explicit path whose repository's origin fails `sameRepository` is refused as `different-origin`, carrying both URLs.
- With `origin` given, a missing path becomes an offer at that path. A home-directory target is either no path, where the walk-up found nothing or found a repository with a different origin, or a path resolving to `os.homedir()`. It first derives `repositoryName(origin)`, and refuses as `no-repo-name` when there is none. Then it checks `~/<repo-name>`. A clone of this project there is used. An empty folder or a missing one becomes an offer at `~/<repo-name>`. Anything else is refused as `occupied`.
- Without `origin` (an attach, or a local project with no origin), every one of those cases keeps today's outcome, carried as a refusal (`not-found`, `no-repository-found`, `not-repository`, `no-origin`) instead of a bare string.
- The offer's `url` is the URL that will be cloned. The classifier takes the forwarded token's presence as an input for that, and it is the only thing it uses the token for.

### Offer, lock, and clone (`src/remote/serve-root-offer.ts` and `src/remote/serve-root-lock.ts`, new)

- `serve-root-lock.ts` exposes `acquireRootLock(target)`. It resolves to a release function once this process holds the lock, waiting while a live pid holds it and taking over a dead one. The lock file is `~/.janissary/remote-root-locks/<sha256 of target>.lock`, and the folder is created on first use. Liveness is `isOwnInstanceAlive(pid)` from `src/instance-lock.ts`, since the lock lives in the user's own home and a recycled pid owned by another account can't be the holder. The file holds a bare pid, as `acquireLock` in that file writes one, but it's opened with the exclusive `wx` flag so two launches racing for a free lock can't both win. It polls every 500 ms with no timeout, because the holder is either waiting on a prompt or cloning, and closing either tab ends the wait.
- `runRootOffer(offer, context)` takes the lock and re-classifies, since another launch may have cloned meanwhile. It emits `clone-offer` and awaits the matching `clone-answer`, which `RemoteServer.dispatch` delivers to it. On accept it runs `startGitClone` with the forwarded token and stderr kept. It resolves to `{ root, cloned }` on success, or `{ refusal }` for `declined`, `clone-failed` (with git's reason), or a changed classification. It removes what it created on failure, releases the lock on every path, and exposes a `cancel` that `RemoteServer.shutdown` calls.

### Remote startup and dispatch (`src/remote/serve.ts`, `src/remote/serve-root-settle.ts` new, `src/remote/serve-provision.ts`)

- `runRemoteServer(path)` no longer resolves the root. It sets raw mode as today and starts `RemoteServer` with the path argument instead of a root. The pre-handshake `workspace-failed` write is removed.
- `RemoteServer.listen()` writes the handshake immediately, without a root, and without starting a peer.
- `serve-root-settle.ts` exposes `settleRoot(root)`. It runs `loadConfig`, `loadProjectTokens`, `loadGitIdentity`, and `initWorkspaceDir`, and returns the `WorkspaceManager` for that root. `RemoteServer` then starts its `DetachedPeer` and switches `emit` to route through it, the way `listen()` does today.
- `dispatch` changes:
  - `provision`: when no root is settled, it runs `resolveRemoteRoot(path, frame.origin)`. A refusal emits `root-refused`. An offer runs `runRootOffer`. A root settles, then `provisionRemoteWorkspace` runs as today, with the `cloned` record added to its `workspace-ready`.
  - `attach`: when no root is settled, it resolves one without an origin. A failure answers `attach-result` `accepted: false`.
  - `clone-answer` is delivered to the pending offer. With none pending, it's refused like any other unexpected frame.
- `provisionRemoteWorkspace` computes `tokens` before `workspaces.create` instead of after, and passes the forwarded `github` token to it.
- `detach()` with no peer shuts down instead of parking. `shutdown()` cancels a pending offer before removing workspaces.
- `serve.ts` is at about 193 counted lines. `runRemoteServer` and `wireShutdown` move into a new `src/remote/serve-start.ts`, and `src/main.ts` imports `runRemoteServer` from there. Together with `serve-root-settle.ts` taking the setup calls, that keeps `serve.ts` under the limit.

### Protocol (`src/remote/protocol.ts`, `src/remote/root-refusal.ts` new, `src/remote/frame-decode-root.ts` new)

- `root-refusal.ts` declares the refusal union. Its kinds are `not-found`, `no-repository-found`, `not-repository`, `no-origin`, `different-origin` (with `other` and `url`), `occupied`, `no-repo-name` (with `url`, and `path` as the home directory), `declined` (with `url`), and `clone-failed` (with `url` and `reason`). Each carries `path`.
- `protocol.ts` adds the new frame members and registry entries, and drops `root` from the handshake. `protocol.ts` is at about 181 counted lines, so the decoders for `clone-offer`, `clone-answer`, `root-refused`, and the `provision.origin` and `workspace-ready.cloned` fields go in `frame-decode-root.ts`, the way the existing `frame-decode-*.ts` modules split decoding. Validation follows the rules in `product/specs/remote-server.md`: strings nonempty, `accept` a boolean, an unknown refusal kind malformed, and an optional field either absent or valid.

### Local side

- `src/workspace/manager.ts`: a public `origin()` over the existing private `originUrl()`.
- `src/pseudoterminal-manager.ts`: `spawnTransport`'s `handlers` gains an optional `onInput(data)`. `input(id, data)` calls it instead of writing when the entry is a transport that has one.
- `src/remote/clone-prompt.ts` (new, pure): the prompt text for an offer, the `Cloning …` line, and a key interpreter that returns accept, decline, or ignore for a chunk of input.
- `src/remote/entry-factory.ts`:
  - The `provision` sent from `onAttached` adds `origin: withoutCredentials(managers.workspace.origin())` when there is one.
  - The transport's `onInput` writes to ssh while the channel is authenticating. Once it's attached, input goes to a pending offer through `clone-prompt.ts`, and anything else is dropped.
  - `clone-offer` in `onFrame` draws the prompt and marks the offer pending. `root-refused` settles the entry, rejects `ready`, and calls the launch handler's new `onRootRefused`, the way `name-in-use` calls `onNameRefused`. `workspace-ready.cloned` is passed to `onReady` as a fourth argument after `cleaned`.
- `src/remote/channel.ts` and `src/remote/channel-types.ts`: `ChannelFrame` gains `clone-offer` and `root-refused`, and `dispatch` routes them to `onFrame`. `channel.ts` is at about 198 counted lines, so the case list that forwards to `onFrame` becomes a lookup against a `CHANNEL_FRAME_TYPES` set exported beside `ChannelFrame`. That replaces seven case labels with one check.
- `src/remote/manager.ts`: `RemoteLaunchHandlers.onReady` gains the optional fourth `cloned` parameter, and the type gains an optional `onRootRefused`. `joinedHandlers` and `src/sessions/terminate-session.ts` need no change, since both are optional.
- `src/launch-name/refusal.ts`: a new `RemoteRootRefusal` error carrying the host and the structured refusal. `startRemoteLaunch` rejects `ready` with it from `onRootRefused`, and `RemoteLaunchState` gains `cloned()` beside `cleaned()`. `remoteChannelClosed` (`src/remote/manager-closed.ts`) already skips its "ended before ready" rejection once `entry.settled` is true.
- `src/launch-name/fail-remote.ts`: `failRemoteLaunch` shows a `RemoteRootRefusal`'s composed message through `failure.show`, and posts the same text as `launch-refused` to `retry.creator` when a `retry` is present. It closes the tab after `PROVISION_FAILURE_CLOSE_DELAY_MS`, the path `LaunchCheckUnanswered` takes. A `reportRemoteClone` beside `reportRemoteCleanup` posts `launch-root-cloned`. It's called next to `reportRemoteCleanup` in `startRemoteTab` (`src/harness/remote-launch.ts`) and in `src/profile/remote-agent.ts`.
- `src/launch-name/messages.ts`: one function per refusal kind, plus `clonedNotice`, all carrying the name and host.
- `src/notifications/index.ts` and `format.ts`: the `launch-root-cloned` kind, with no toggle, like `launch-workspace-cleaned`.

### Order of work

Each step leaves typecheck and tests green:

1. `src/git/repository-url.ts` and `src/git/clone.ts`, moving `toHttpsUrl`, adding `isGitHubUrl`, and switching `provisionWorkspace` and `WorkspaceManager.create` to the shared clone with an optional token.
2. The protocol: `root-refusal.ts`, `frame-decode-root.ts`, the new frame members, the handshake without `root`, and the version bump.
3. The remote side: `serve-root.ts` classification, `serve-root-lock.ts`, `serve-root-offer.ts`, `serve-root-settle.ts`, `serve-start.ts`, the deferred root in `serve.ts`, and the token in `serve-provision.ts`.
4. The local side: `WorkspaceManager.origin()`, the transport input handler, `clone-prompt.ts`, the channel routing, the entry factory, the launch handlers, the refusal error, the messages, and the notification kind.
5. The specs.

### Specs

- `product/specs/remote-server.md`:
  - A new "Missing clone" subsection under "Failures" covering the offer cases, the prompt, the lock, cleanup, and every message. The "Failures" list gets the new wording.
  - The credentials paragraphs replace "The initial clone uses whatever transport the *remote* repository's `origin` already has" with the forwarded-token rule for both clones.
  - The `janus remote-serve` section says the root is settled on the first `provision` or `attach` rather than at startup.
  - A version-21 paragraph goes in the existing style.
- `product/specs/workspaced-agent.md`: its "initial clone … uses whatever transport the root repository's `origin` already uses" paragraph stays true for local workspaces. It gains one sentence pointing to `remote-server.md` for the forwarded-token clone on a remote.
- `product/specs/notifications.md`: the `launch-root-cloned` event.

## Tests

- `src/git/repository-url.test.ts` (new): the moved `toHttpsUrl` cases, plus `isGitHubUrl` across the three URL forms and non-GitHub hosts. It covers `sameRepository` over scp, `ssh://`, and HTTPS forms, host case, `.git`, and different owners or hosts. It also covers `repositoryName`, and `withoutCredentials` clearing HTTPS usernames and passwords while keeping an `ssh://` login.
- `src/git/clone.test.ts` (new): a clone from a local bare repository succeeds. A bad URL rejects with git's first stderr line when stderr is kept and with the exit code otherwise. `cancel` kills and rejects. With a token and a GitHub URL, the spawned arguments and the clone's resulting `.git/config` contain no token, and the child environment does. The spawn is observed rather than hitting GitHub.
- `src/workspace/index.test.ts` and `src/workspace/manager.test.ts`: the existing `provisionWorkspace` cases still pass on the extracted helper, `create` passes a token through, and `origin()` returns the origin, or `undefined` without a repository or an `origin` remote.
- `src/github-url.test.ts`: `githubCommitsUrl` still passes on the shared host check.
- `src/remote/serve-root.test.ts` (new): every classification outcome against temp directories and a fake home. That covers use, the offer for a missing path, no path, and explicit `~`, and the `~/<repo-name>` lookup finding a clone, an empty folder, or an occupied folder. It also covers a no-path walk-up that lands on a different-origin repository, which falls through to the home flow, and an origin with no usable repo name, refused as `no-repo-name`. Then the `different-origin`, `not-repository`, and `no-origin` refusals, and the unchanged outcomes when no origin is given. The offer's `url` is the HTTPS form with a token and a GitHub origin, and the origin as-is otherwise.
- `src/remote/serve-root-lock.test.ts` (new): exclusive acquisition, waiting on a live holder, taking over a dead pid, and release.
- `src/remote/serve-root-offer.test.ts` (new): with a fake emitter and a local bare repository, an accept clones and reports `cloned`, and a decline reports `declined`. A failed clone removes its folder and reports git's reason. `cancel` mid-prompt declines, and `cancel` mid-clone removes the partial clone. An existing empty `~/<repo-name>` keeps its folder. A waiter that finds the clone done after the lock is released uses it without offering.
- `src/remote/serve.test.ts`: the handshake is written before any root is resolved and carries no root. `provision` with an unusable root answers `root-refused` and starts no peer. `provision` with an offer emits `clone-offer` and continues to `workspace-ready` with `cloned` after an accepting `clone-answer`. `attach` with no resolvable root answers `accepted: false`. A `clone-answer` with no pending offer is refused. `detach` before a peer exists shuts down, and `shutdown` cancels a pending offer.
- `src/remote/serve.test.ts`, beside its existing `provisionRemoteWorkspace` cases: the forwarded GitHub token reaches `workspaces.create`.
- `src/remote/protocol.test.ts`: the new frames and fields round-trip, malformed ones are refused, the handshake has no root, and the version is 21.
- `src/remote/clone-prompt.test.ts` (new): both prompt wordings, the `Cloning …` line, and the key interpreter covering `y`, `Y`, `n`, `N`, `\r`, `\n`, Escape, Ctrl-C, and ignored keys.
- `src/remote/channel.test.ts`: `clone-offer` and `root-refused` reach `onFrame`, and the existing routed frames still do.
- `src/remote/manager.test.ts`: a fresh launch's `provision` carries the credential-free origin. Keystrokes before the handshake reach ssh, keystrokes after it don't, and a pending offer's `y` sends `clone-answer` `accept: true` and draws the status line. A `root-refused` fails the launch with the composed message and posts `launch-refused`. A `workspace-ready` with `cloned` posts `launch-root-cloned`.
- `src/pseudoterminal-manager.test.ts`: a transport with `onInput` routes keystrokes through it, and one without still writes them to the PTY.
- `src/launch-name/fail-remote.test.ts` and a messages test: each refusal kind's exact wording, the placeholder display, the notification, and the delayed close.
- `src/notifications/format.test.ts`: the new kind formats like its siblings.

## Out of scope

- Shipping or installing janissary on the remote. `janus` must already be on the remote's PATH (`product/specs/remote-server.md`, "Bootstrap requirement").
- Fixing a repository that is there but wrong. Nothing re-points an existing repository's `origin`. An explicit path whose repository has a different origin only fails with the real reason. The one exception is a no-path launch whose walk-up lands on such a repository, which falls through to the home-directory flow.
- Offering a clone for an existing path that isn't a git repository, other than the home directory.
- Updating an existing root clone. Nothing fetches or pulls the remote root, since workspaces clone from `origin` anyway.
- Attaching a parked session and `--relaunch` restores. Only a new launch compares origins and offers a clone.
- Remembering where a clone went. There's no local record of the chosen path. A later launch finds it through the `~/<repo-name>` lookup or by naming the path.
- Streaming git's own clone output into the placeholder terminal.
- Local git credentials other than the project's `.janissary/github-token`: the local credential helper, SSH keys, and ssh agent forwarding are not used.
- Credentials for non-GitHub origins. Those clones use the remote host's own git access, as today.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Manual, against a host with `janus` at this version and a local `.janissary/github-token`:
  1. `harness claude on <host>:/tmp/<new-folder>`. The placeholder shows the prompt. `n` closes it with the declined line in the placeholder and the feed.
  2. Repeat and answer `y`. `Cloning …` shows, the harness starts, the feed shows `Cloned <url> into /tmp/<new-folder> on <host>.`, and the folder is a clone of this project.
  3. On a host with no GitHub credentials of its own, with this project private, step 2 still succeeds. Neither `/tmp/<new-folder>/.git/config` nor the workspace clone's config contains the token.
  4. Remove the local `.janissary/github-token` and repeat step 3 against a fresh folder. The launch fails with the clone-failed line carrying git's reason.
  5. `harness claude on <host>` against a host with no repository above the login directory. The prompt offers `~/<repo-name>`. After accepting, a second `harness claude on <host>` launches without a prompt.
  6. `harness claude on <host>:<a repo with another origin>` fails with the different-origin line, and nothing is provisioned.
  7. A two-tab profile against a fresh missing path shows one prompt, and both tabs launch after it is accepted.
  8. Type a few keys into a placeholder after the handshake but before any prompt. The launch is unaffected.
