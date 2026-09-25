# Remote path does not point to a clone of the project

**Complexity: 7/10** — a new pre-handshake phase on the remote (a terminal prompt, a cross-process lock, and a cancellable clone with signal-driven cleanup), a protocol version bump with new handshake fields, a new failure route through the launch funnel, and three extractions to keep `serve.ts`, `channel.ts`, and `protocol.ts` under the size limit.

A remote launch (`harness claude on <host>`, `agent <name> on <host>[:path]`) only works when the remote path is already a clone of the project repository with an `origin` remote. When it isn't, the launch fails with a message that hides the cause: `Cannot launch "fariz": could not check thecandykingdom for an existing "fariz" — Remote session to thecandykingdom ended before its workspace was ready.` The user can't tell that the fix is to put a clone on the host. This feature checks that the remote holds a clone of *this* project. When the clone is missing, it offers to create it, so a fresh host becomes usable from inside janissary. Every other root failure reports its real reason.

## Design decisions

### Established by the code and the feature text

- **Why the real error is lost today.** `runRemoteServer` in `src/remote/serve.ts` resolves the remote root before anything else. On failure it writes a `workspace-failed` frame and exits with code 1, before it has written the handshake line. The local `RemoteChannel` (`src/remote/channel.ts`) is still in its `authenticating` terminal phase, so it passes that frame to the tab's terminal as raw text. Then ssh exits, `remoteChannelClosed` (`src/remote/manager-closed.ts`) rejects readiness with "ended before its workspace was ready", and `startRemoteLaunch` (`src/harness/remote-launch.ts`) turns that into a `LaunchCheckUnanswered`. That produces the `could not check <host>` notification. The actual reason, such as `<path> is not a git repository.` or `No git repository found at or above <dir>.`, never reaches the notifications feed.
- **Check for the correct clone.** Per the feature text, the remote must hold a clone of *this* project, not just any git repository. Today `resolveRemoteRoot` (`src/remote/serve-root.ts`) only checks for a `.git` entry and an `origin` remote. It never compares that origin with the local project's origin.
- **Offer to clone when missing, into a subdirectory of a home directory.** These come from the feature text.
- **The remote clones with its own git transport.** A workspace clone already runs `git clone <origin>` on the remote with whatever transport that host has (`provisionWorkspace` in `src/workspace/index.ts`). A root clone runs on the same host under the same terms. No forwarded token is involved, because the root is resolved before the provisioning frame that carries the tokens exists.

### Product decisions

- **When the clone is offered.** The offer is made in exactly three cases:
  - **The address names a path that does not exist** (`on host:/srv/proj` with no `/srv/proj`). The clone creates it, along with any missing parent folders.
  - **The address names no path, and the walk-up from the ssh login directory finds no clone of this project** (`on host`). That covers finding no git repository at all, and finding one whose `origin` is a different repository, such as a home directory kept as a dotfiles repository. The target is the remote user's home directory, even when the login directory is somewhere else.
  - **The address names the remote user's home directory** (`on host:~`, or its absolute form), which exists and isn't a git repository. It's treated exactly like the no-path case.
- **When it isn't offered.** These cases fail the launch with the host's real reason and provision nothing: an explicit path that exists but isn't a git repository (other than the home directory), a repository with no `origin` remote, and an explicit path whose repository has a different `origin`.
- **A home directory gets a subdirectory.** When the target is the home directory, the clone goes into `~/<repo-name>`. The repo name is the origin URL's last path segment without `.git`. For example, `git@github.com:thirtysixthspan/janissary.git` clones into `~/janissary`. When no usable folder name can be derived from the URL (no path segment, or one that isn't a single folder name), nothing is offered and the launch fails with the real reason.
- **A home-directory target finds an earlier clone first.** Before offering, a launch whose target is the home directory looks for `~/<repo-name>`. When that folder is a clone of this project, the launch is rooted there with no question asked, so after one accepted offer every later `on host` launch just works. When `~/<repo-name>` is an empty folder, the offer is made and the clone goes into it. When it's a non-empty folder that isn't a clone of this project, the launch fails with the real reason and nothing is offered.
- **"This project" means the same repository over any transport.** Two origins match when they name the same host, owner, and repository. SSH scp form (`git@github.com:o/r.git`), `ssh://` form, and HTTPS form are equivalent. Host comparison ignores case, and a trailing `.git` is ignored. Exact string matching would reject real clones, because workspace clones already rewrite their origin to HTTPS (`finishProvisioning` in `src/workspace/index.ts`).
- **The question is asked in the placeholder tab's terminal.** It's a y/n prompt in the same terminal where ssh's password, passphrase, and host-key prompts already render. There's no modal and no question panel. This keeps the rule from `product/specs/remote-server.md` ("Authentication") that the placeholder terminal is the only prompt mechanism for a launch. It works the same for a harness placeholder and for an agent placeholder, which shows the ssh session full-screen over its transcript.
- **Prompt wording and keys.** Terminal lines leave out the host, since the tab's host chip already shows it. For a missing path the prompt reads `<path> is not a clone of this project. Clone <url> into <path>? [y/N] `. For a home-directory target it reads `<home> has no clone of this project. Clone <url> into <home>/<repo-name>? [y/N] `. `y` or `Y` clones. `n`, `N`, Enter, Escape, or Ctrl-C declines. Ctrl-C arrives as a key, not a signal, because the prompt reads raw input. Any other key is ignored and the prompt stays up.
- **The clone runs silently.** Like a workspace clone today, git's own progress and error output isn't streamed into the placeholder terminal. While it runs, the terminal shows one status line, `Cloning <url> into <path>…`. When it fails, git's first error line becomes the failure's reason.
- **A successful clone is announced.** Once the workspace is ready, `Cloned <url> into <path> on <host>.` is posted to the notifications feed. It's attributed to the launch's creator, the same way as the existing `Removed leftover workspace …` line.
- **Concurrent launches share one prompt and one clone.** Two launches can reach the same missing target on the same host at the same time, such as two tabs from one profile. Only the first shows the prompt. It takes a lock on the target when the prompt is shown and holds it through the clone. The other launch waits silently through the question and the clone, then uses the result without asking. If the first launch is declined, cancelled, or its clone fails, the waiting launch asks for itself.
- **Cancel and failure clean up only what the clone created.** Closing the placeholder tab, or losing the ssh session, while the prompt is up counts as declining. Doing so while the clone runs kills git. A cancelled or failed clone removes the folder it created. For an empty `~/<repo-name>` that already existed, it removes that folder's contents and leaves the folder. Nothing that existed before the clone is touched.
- **A root failure reports its real reason.** It appears in the placeholder before it closes and in the notifications feed, attributed to the tab the launch was typed in (or a profile launch's issuing tab):
  - Declined: `Cannot launch "<name>": <path> on <host> is not a clone of this project — clone declined.`
  - Clone failed: `Cannot launch "<name>": cloning <url> into <path> on <host> failed — <reason>.`
  - Different origin: `Cannot launch "<name>": <path> on <host> is a clone of <other-url>, not <this-url>.`
  - Existing path that isn't a repository (other than home): `Cannot launch "<name>": <path> on <host> is not a git repository.`
  - Occupied `~/<repo-name>`: `Cannot launch "<name>": <path> on <host> exists and is not a clone of this project.`
  - No origin: `Cannot launch "<name>": <path> on <host> has no "origin" remote.`
  - No usable repo name for a home target: `Cannot launch "<name>": cannot name a folder for <url> under <home> on <host>.`
  - Missing path when no origin could be sent: `Cannot launch "<name>": <path> on <host> does not exist.`
  - No repository above the login directory when no origin could be sent: `Cannot launch "<name>": no git repository found at or above <dir> on <host>.`

### Implementation decisions

- **The check, the prompt, and the clone all run on the remote, before the handshake.** `janus remote-serve` does the work while the channel is still in its terminal phase. That's where ssh's own prompts already render and where the tab's keystrokes already flow to the ssh session. No new frame types are added. The `DetachedPeer` record under the root's `.janissary/remote/` keeps its current ordering: the root is settled before the peer starts, and the peer starts before the handshake.
- **The local origin reaches the remote as a CLI option.** The ssh command becomes `janus remote-serve --origin <url> [<path>]`. An older remote rejects the unknown option with its own usage error before any handshake. The user sees that text in the placeholder terminal, followed by today's generic `ended before its workspace was ready` line. That's accepted for a mismatched remote.
- **`--origin` goes only on a fresh launch's first connection.** Reconnects after a lost transport, attaches, `--relaunch` restores, and the detached capture query leave it off. Without it, `remote-serve` resolves its root exactly as it does today: no origin comparison and no offer. It still reports its real reason through the handshake.
- **The URL sent is the local origin as-is, minus credentials.** Any credentials embedded in it are stripped before the URL leaves this machine (see `shareableOrigin` below). If what's left has a character outside the conservative set that addresses are validated against (letters, digits, `. - _ / ~ @ :`), no `--origin` is sent. The launch then behaves as it does without the option.
- **The handshake carries the outcome.** The handshake line gains two optional fields. `refusal` is structured data: a kind, the path, and, depending on the kind, the other origin, this origin, or a reason. `cloned` carries the URL and path of a clone made for this launch. On any root failure, `remote-serve` writes the handshake with `refusal` and exits, without starting a peer. The local side checks the version first and then the refusal. The remote never composes the `Cannot launch …` sentence, because it knows neither the tab's name nor the host alias the user typed.
- **Protocol version moves to 21.** The handshake's meaning changes: a version-20 remote never compares origins and never offers a clone. `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` moves, with a comment in the existing style.
- **The lock lives under the remote user's `~/.janissary/`.** There's one lock file per target, named by a hash of the target's absolute path, holding the holder's pid. It's created exclusively. A lock whose pid is dead is taken over. A waiter polls it, and when it's released the waiter classifies the target again before deciding whether to ask.
- **Repository-URL helpers move to a new `src/git/repository-url.ts`.** `toHttpsUrl` moves there from `src/workspace/index.ts`, and the new pure helpers join it.
- **One cancellable `git clone` helper serves both clones.** The spawn-and-wait inside `provisionWorkspace` is extracted into a shared helper. The workspace clone keeps ignoring git's output. The root clone keeps stderr so it can report git's first error line.
- **The remote side is split by concern.** `serve-root.ts` classifies the root. A new `serve-root-offer.ts` runs the prompt, the lock, and the clone. A new `serve-root-lock.ts` owns the lock file. `runRemoteServer` sequences them before `listen()`.
- **Input before the handshake is discarded.** The local side sends no frame until it has read the handshake (`onAttached` in `src/remote/entry-factory.ts` is the first `send`). So anything `remote-serve` reads from stdin before it has written the handshake is the user's typing: the prompt's answer, or extra keys after it, such as `yes` followed by Enter. The offer consumes only the one key it acts on. `RemoteServer.receive` drops everything that arrives before `listen()` has written the handshake line, so a stray key can't be glued onto the first `provision` frame and refused as malformed.
- **The declined and clone-failed lines name the clone target.** `<path>` in those two lines is the folder the clone would have gone into. For a home-directory target that's `<home>/<repo-name>`, matching the prompt's `Clone <url> into <path>`.
- **The local origin comes from `WorkspaceManager`.** It already resolves the project root's origin in its private `originUrl()` (`src/workspace/manager.ts`, used by `preflight`). A public `origin()` returning the URL, or `undefined` when there is no repository or no `origin`, exposes it without a second lookup path. `createRemoteEntry` reads it from `managers.workspace`.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Remote root resolution and its failure messages | `src/remote/serve-root.ts` (`resolveRemoteRoot`, `withOrigin`) | Becomes the classifier; its checks stay and gain the origin comparison and home handling |
| Remote server startup | `src/remote/serve.ts` (`runRemoteServer`, `RemoteServer.listen`, `wireShutdown`) | Sequences the classification and offer before `listen()`, and writes the refusal handshake |
| Handshake line and version check | `src/remote/protocol.ts` (`encodeHandshake`, `parseHandshake`, `RemoteHandshake`, `REMOTE_PROTOCOL_VERSION`) | Gains `refusal` and `cloned`; the version moves to 21 |
| Local channel terminal phase | `src/remote/channel.ts` (`consumeTerminalPhase`) | Where a refusal handshake is recognized instead of entering the frame phase |
| Channel entry and ssh command | `src/remote/entry-factory.ts` (`sshRemoteCommand`, `remoteServeCommand`, `createRemoteEntry`, `onAttached`) | Adds `--origin` on a fresh launch's first connection; carries `cloned` to `onReady` |
| Launch state and failure funnel | `src/harness/remote-launch.ts` (`startRemoteLaunch`), `src/launch-name/fail-remote.ts` (`failRemoteLaunch`, `reportRemoteCleanup`), `src/profile/remote-agent.ts` | Routes the new refusal error and the cloned notice for both harness and agent launches |
| Notification wording in one place | `src/launch-name/messages.ts` | Hosts the new `Cannot launch …` and `Cloned …` lines |
| Notification kinds | `src/notifications/index.ts`, `src/notifications/format.ts` | New `launch-root-cloned` kind, next to `launch-workspace-cleaned` |
| Origin lookup, HTTPS normalization, async clone | `src/workspace/index.ts` (`getRemoteUrl`, `toHttpsUrl`, `provisionWorkspace`) | `toHttpsUrl` moves; the clone spawn is extracted |
| Home-relative path expansion | `src/paths.ts` (`expandUserPath`) | Recognizing `~` targets |
| CLI parsing for `remote-serve` | `src/cli-args.ts` (`parseCliArgs`, `CliArgs.remoteServePath`) | Gains `--origin` |
| Single-folder-name check | `src/workspace/label.ts` (`workspaceLabelError`) | Validates the derived repo name before it becomes a folder |

## Proposed changes

### Repository URLs (`src/git/repository-url.ts`, new)

- `toHttpsUrl` moves here unchanged. `src/workspace/index.ts` and `src/github-url.ts` import it from the new module, and its tests move with it.
- `sameRepository(a, b)`: true when both URLs name the same host, owner, and repository. It normalizes each through `toHttpsUrl`, then parses it with Node's `URL`, which already lowercases the host and exposes the path. It compares host and path, ignoring a trailing `.git` and a trailing slash. A URL that `URL` can't parse matches only an identical string.
- `repositoryName(url)`: the last path segment without `.git`, or `undefined` when there isn't one or it fails `workspaceLabelError`.
- `shareableOrigin(url)`: parsed with Node's `URL` when it has a scheme. For `http:` and `https:`, both `username` and `password` are cleared, because a token often sits in the username alone (`https://<token>@github.com/…`). For `ssh:` only `password` is cleared, since the username is the ssh login (`git`), not a secret. The result is re-serialized. The scp form (`git@host:o/r.git`) carries no password and passes through as is. The result is `undefined` when it has a character outside the address charset.

### Shared clone (`src/git/clone.ts`, new)

- `startGitClone(url, target, options)` spawns `git clone <url> <target>` without a shell and returns `{ ready, cancel }`, the same shape `ProvisionHandle` has today. `ready` rejects with git's first non-empty stderr line when stderr is kept, or with `git clone exited with code <n>` otherwise. `cancel` kills the child.
- `provisionWorkspace` in `src/workspace/index.ts` uses it with stderr ignored, so its behavior doesn't change.

### Remote root classification (`src/remote/serve-root.ts`)

- `resolveRemoteRoot(argument, origin)` returns one of three outcomes: use `{ root }`, offer `{ offer: { target, display, url } }`, or refuse `{ refusal }`. The walk-up, `expandUserPath`, the `.git` check, and the `origin` check stay as they are.
- With `origin` given, a found root whose own origin fails `sameRepository` is refused as `different-origin`, carrying both URLs.
- With `origin` given, a missing path becomes an offer at that path. A home-directory target is either no path, where the walk-up found nothing or found a repository with a different origin, or a path resolving to `os.homedir()`. It first derives `repositoryName(origin)`, and refuses as `no-repo-name` when there is none. Then it checks `~/<repo-name>`. A clone of this project there is used. An empty folder or a missing one becomes an offer at `~/<repo-name>`. Anything else is refused as `occupied`.
- Without `origin`, every one of those cases keeps today's outcome, carried as a refusal (`not-found`, `no-repository-found`, `not-repository`, `no-origin`) instead of a bare string.
- The refusal type is a discriminated union shared with the handshake codec. It's declared in `src/remote/handshake-fields.ts` (see "Handshake" below), since it's part of the wire contract.

### Offer, lock, and clone (`src/remote/serve-root-offer.ts` and `src/remote/serve-root-lock.ts`, new)

- `serve-root-lock.ts` exposes `acquireRootLock(target)`. It resolves to a release function once this process holds the lock, waiting while a live pid holds it and taking over a dead one. The lock file is `~/.janissary/remote-root-locks/<sha256 of target>.lock`, and the folder is created on first use. Liveness is `isOwnInstanceAlive(pid)` from `src/instance-lock.ts`, the probe the instance lock uses, since the lock lives in the user's own home and a recycled pid owned by another account can't be the holder. It's created the way `acquireLock` in that file writes a bare pid, but opened with the exclusive `wx` flag, so two launches racing for a free lock can't both win. It polls every 500 ms with no timeout, because the holder is either answering a prompt or cloning, and closing either tab ends the wait.
- `runRootOffer(offer, io)` takes the lock, re-classifies (another launch may have cloned meanwhile), writes the prompt, and reads keys through the injected `io` (stdin in raw mode and stdout in production, fakes in tests). In raw mode Enter arrives as `\r`, and `\n` is accepted as Enter too. On `y` or `Y` it writes the status line and runs `startGitClone` with stderr kept. It resolves to `{ root, cloned }` on success or `{ refusal }` for `declined`, `clone-failed` (with git's reason), or a changed classification. It removes what it created on failure, and releases the lock on every path.
- While the offer runs, `SIGHUP`, `SIGTERM`, and `SIGINT` cancel it: the prompt counts as declined, git is killed, the partial clone is removed, and the lock is released before exit. These handlers are replaced by `wireShutdown`'s once `listen()` runs.

### Remote startup (`src/remote/serve-start.ts` new, `src/remote/serve.ts`, `src/cli-args.ts`, `src/main.ts`)

- `parseCliArgs` accepts `--origin <url>` alongside `remote-serve`, as `CliArgs.remoteServeOrigin`, declared in `parseArgs`'s `options` like `port`. Every other command ignores it.
- `runRemoteServer` moves out of `serve.ts` into a new `src/remote/serve-start.ts`, since `serve.ts` is at about 193 counted lines. `src/main.ts` imports it from there and awaits it: `runRemoteServer(args.remoteServePath, args.remoteServeOrigin)`.
- `runRemoteServer(path, origin)` becomes async. It puts stdin in raw mode first, as it already does later today (`process.stdin.setRawMode(true)`), because the prompt needs single keys. Then it classifies the root and runs the offer when there is one. On a refusal it writes `encodeHandshake` with the refusal and exits 1 without loading config or starting a peer. On success it continues exactly as today (`loadConfig`, `loadProjectTokens`, `loadGitIdentity`, `initWorkspaceDir`, then `new RemoteServer(root, …).listen()`). The old pre-handshake `workspace-failed` write is removed.
- `RemoteServer` takes the optional `cloned` and passes it to `encodeHandshake` in `listen()`. Its `receive` drops input until that handshake line has been written (see "Input before the handshake is discarded").

### Handshake (`src/remote/protocol.ts`, `src/remote/handshake-fields.ts` new)

- `RemoteHandshake` gains optional `refusal` and `cloned`. `encodeHandshake` takes them, and `parseHandshake` validates them after the version check. A malformed refusal or cloned record is `Malformed remote handshake.`. `REMOTE_PROTOCOL_VERSION` becomes 21, with a comment paragraph in the existing style above it.
- `protocol.ts` is at about 181 counted lines, so the refusal and cloned types and their validators go in a new `src/remote/handshake-fields.ts`, the way frame decoding is already split into `frame-decode-*.ts`. `parseHandshake` stays in `protocol.ts` and calls them, so none of the fourteen files that import handshake symbols from `protocol.ts` change their imports.
- The refusal union's kinds are `not-found`, `no-repository-found`, `not-repository`, `no-origin`, `different-origin` (with `other` and `url`), `occupied`, `no-repo-name` (with `url`, and `path` as the home directory), `declined` (with `url`), and `clone-failed` (with `url` and `reason`). Each carries `path`. Strings must be nonempty, and an unknown kind is malformed.

### Local side

- `src/workspace/manager.ts`: a public `origin()` over the existing private `originUrl()`.
- `src/remote/entry-factory.ts`: `sshRemoteCommand` inserts `--origin <url>` before the path when given. `remoteServeCommand(address, origin?)` passes it through, and `remoteCaptureCommand` never does. `createRemoteEntry` computes `shareableOrigin(managers.workspace.origin())` once. It passes that only to the first `connect()` of an entry created without `resume`, which is the `generation === 1` call. Reconnects through `Attach` call the same `connect` and get none. A missing local origin sends nothing. The `cloned` record from the handshake (`onAttached` already receives the parsed handshake) is kept on the entry and passed to the launch handler's `onReady` as a fourth argument after `cleaned`.
- `src/remote/manager.ts`: `RemoteLaunchHandlers.onReady` gains the optional fourth `cloned` parameter, and the type gains an optional `onRootRefused`, like `onNameRefused`. `joinedHandlers` and `src/sessions/terminate-session.ts` need no change, since both parameters are optional.
- `src/remote/channel.ts`: when the parsed handshake carries `refusal`, `consumeTerminalPhase` calls a new `onRootRefused` handler, sets the state to `closed`, and returns without calling `onAttached`. `RemoteChannelHandlers` (`src/remote/channel-types.ts`) gains the handler. `channel.ts` is at about 198 counted lines, so the sentinel scan at the top of `consumeTerminalPhase` moves into a pure helper in a new `src/remote/channel-terminal.ts`. The helper takes the buffer and returns the text for the terminal, the complete handshake line if there is one, and the remaining buffer. The channel keeps the state changes.
- `src/remote/entry-factory.ts` maps `onRootRefused` the way it maps `name-in-use`: it settles the entry, rejects `ready`, and calls the launch handler's `onRootRefused`.
- `src/launch-name/refusal.ts`: a new `RemoteRootRefusal` error carrying the host and the structured refusal. `startRemoteLaunch` rejects `ready` with it from `onRootRefused`. `RemoteLaunchState` gains `cloned()` beside `cleaned()`. `remoteChannelClosed` (`src/remote/manager-closed.ts`) already skips its "ended before ready" rejection once `entry.settled` is true, so the ssh exit that follows the refusal adds nothing.
- `src/launch-name/fail-remote.ts`: `failRemoteLaunch` shows a `RemoteRootRefusal`'s composed message through `failure.show`, and posts the same text as `launch-refused` to `retry.creator` when a `retry` is present. It closes the tab after `PROVISION_FAILURE_CLOSE_DELAY_MS`, the same path `LaunchCheckUnanswered` takes. A `reportRemoteClone` beside `reportRemoteCleanup` posts `launch-root-cloned` on ready. It's called next to `reportRemoteCleanup` in `startRemoteTab` (`src/harness/remote-launch.ts`) and in `src/profile/remote-agent.ts`.
- `src/launch-name/messages.ts`: one function per refusal kind, plus `clonedNotice`, all carrying the name and host.
- `src/notifications/index.ts` and `format.ts`: the `launch-root-cloned` kind, with no toggle, like `launch-workspace-cleaned`.

### Order of work

Each step leaves typecheck and tests green:

1. `src/git/repository-url.ts` and `src/git/clone.ts`, moving `toHttpsUrl` and switching `provisionWorkspace` to the shared clone.
2. `handshake-fields.ts`, the `RemoteHandshake` fields, and the version bump.
3. The remote side: `serve-root.ts` classification, `serve-root-lock.ts`, `serve-root-offer.ts`, `serve-start.ts`, the `--origin` CLI option, and `main.ts`.
4. The local side: `WorkspaceManager.origin()`, `channel-terminal.ts` and the channel's refusal branch, the entry factory, the launch handlers, the refusal error, the messages, and the notification kind.
5. The specs.

### Specs

- `product/specs/remote-server.md`: a new "Missing clone" subsection under "Failures" covering the offer cases, the prompt, the lock, cleanup, and every message. The "Failures" list gets the new wording. A version-21 paragraph goes in the existing style. The `janus remote-serve` section gets `--origin`.
- `product/specs/cli.md`: `janus remote-serve [--origin <url>] [<project-dir>]`.
- `product/specs/notifications.md`: the `launch-root-cloned` event.

## Tests

- `src/git/repository-url.test.ts` (new): the moved `toHttpsUrl` cases, plus `sameRepository` over scp, `ssh://`, and HTTPS forms, host case, `.git`, and different owners or hosts. Also `repositoryName`, and `shareableOrigin` stripping credentials and refusing unsafe characters.
- `src/git/clone.test.ts` (new): a clone from a local bare repository succeeds. A bad URL rejects with git's first stderr line when stderr is kept and with the exit code otherwise. `cancel` kills and rejects.
- `src/workspace/index.test.ts`: the existing `provisionWorkspace` cases still pass on the extracted helper.
- `src/remote/serve-root.test.ts` (new): every classification outcome against temp directories and a fake home. That covers use, the offer for a missing path, no path, and explicit `~`, and the `~/<repo-name>` lookup finding a clone, an empty folder, or an occupied folder. It also covers a no-path walk-up that lands on a different-origin repository (a dotfiles home), which falls through to the home flow, and an origin with no usable repo name, which is refused as `no-repo-name`. It also covers the `different-origin`, `not-repository`, and `no-origin` refusals, and the unchanged outcomes when no origin is given.
- `src/remote/serve-root-lock.test.ts` (new): exclusive acquisition, waiting on a live holder, taking over a dead pid, and release.
- `src/remote/serve-root-offer.test.ts` (new): with fake `io` and a local bare repository, `y` clones and reports `cloned`. `n`, Enter (`\r` and `\n`), Escape, and Ctrl-C decline, and other keys are ignored. A failed clone removes its folder and reports git's reason. A cancel mid-clone removes the partial clone. An existing empty `~/<repo-name>` keeps its folder. A waiter that finds the clone done after the lock is released uses it without prompting.
- `src/remote/serve-start.test.ts` (new): a refusal writes a handshake carrying it and exits 1 with no `workspace-failed` line and no peer started. `runRemoteServer` has no tests today, so its process-level effects (`process.exit`, stdin, stdout) are passed in as parameters with production defaults, the way `RemoteServer`'s constructor takes `emit` and `exit`.
- `src/remote/serve.test.ts`: input received before the handshake is written is dropped, and the first frame after it dispatches normally. A `cloned` passed to `RemoteServer` appears in its handshake.
- `src/remote/channel-terminal.test.ts` (new): the pure scan, covering the terminal text before the sentinel, a sentinel split across reads, and the handshake line followed by frames in the same chunk. The existing terminal-phase cases in `channel.test.ts` keep passing unchanged.
- `src/workspace/manager.test.ts`: `origin()` returns the origin, or `undefined` without a repository or an `origin` remote.
- `src/remote/protocol.test.ts`: `refusal` and `cloned` round-trip, malformed records are refused, and the version is 21.
- `src/remote/channel.test.ts`: a refusal handshake reaches `onRootRefused`, sends nothing, and never dispatches frames.
- `src/remote/manager.test.ts`: `--origin` appears only on a fresh launch's first ssh command, never on a reconnect or resume. Existing assertions on the exact ssh command string are updated for fresh launches. A root refusal fails the launch with the composed message and posts `launch-refused`. A `cloned` handshake posts `launch-root-cloned` once ready.
- `src/cli-args.test.ts`: `remote-serve --origin <url> <path>` parses both.
- `src/launch-name/fail-remote.test.ts` and a messages test: each refusal kind's exact wording, the placeholder display, the notification, and the delayed close.
- `src/notifications/format.test.ts`: the new kind formats like its siblings.

## Out of scope

- Shipping or installing janissary on the remote. `janus` must already be on the remote's PATH (`product/specs/remote-server.md`, "Bootstrap requirement").
- Fixing a repository that is there but wrong. Nothing re-points an existing repository's `origin`. An explicit path whose repository has a different origin only fails with the real reason. The one exception is a no-path launch whose walk-up lands on such a repository, which falls through to the home-directory flow.
- Offering a clone for an existing path that isn't a git repository, other than the home directory.
- Updating an existing root clone. Nothing fetches or pulls the remote root, since workspaces clone from `origin` anyway.
- Attaching a parked session and `--relaunch` restores. Only a new launch checks the root and offers a clone.
- Remembering where a clone went. There's no local record of the chosen path. A later launch finds it through the `~/<repo-name>` lookup or by naming the path.
- Streaming git's own clone output into the placeholder terminal.
- Using forwarded credentials for the root clone. It runs with the remote host's own git transport.
- A clearer message for a remote too old to know `--origin`. It shows its own usage error.

## Verification

- `$janissary/scripts/run.mjs check-diff`
- Manual, against a host with `janus` at this version:
  1. `harness claude on <host>:/tmp/<new-folder>`. The placeholder shows the prompt. `n` closes it with the declined line in the placeholder and the feed.
  2. Repeat and answer `y`. `Cloning …` shows, the harness starts, the feed shows `Cloned <url> into /tmp/<new-folder> on <host>.`, and the folder is a clone of this project.
  3. `harness claude on <host>` against a host with no repository above the login directory. The prompt offers `~/<repo-name>`. After accepting, a second `harness claude on <host>` launches without a prompt.
  4. `harness claude on <host>:<a repo with another origin>` fails with the different-origin line, and nothing is provisioned.
  5. A two-tab profile against a fresh missing path shows one prompt, and both tabs launch after it is accepted.
