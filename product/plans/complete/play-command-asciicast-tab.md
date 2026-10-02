# A `play` command, and the replay tab renamed to the asciicast tab

**Complexity: 6/10** — one new command and one whole-plugin rename. Nothing is designed from scratch: the command reuses the opener registry `open` already resolves through, and the rename is mechanical across code, specs, and docs. The score is driven by breadth, not by difficulty.

Two spellings of the same thing exist today. `harness replay <label|file.cast>` and `ssh replay <label|file.cast>` are subcommands of two reserved command names, and both funnel into one body (`replaySubcommand`) that resolves a target and routes it into the bundled `replay` tab plugin through the plugin host's **core route** mechanism — a claim that exists, by its own manifest comment, only so that a reserved command name can reach a plugin that cannot claim it. This change replaces both spellings with one top-level `play <file>` command that decides what to play from the file itself, and renames the `replay` plugin, its tab, its client components and its documentation to **asciicast**, after the file format it plays.

The label form — `harness replay devbox`, naming an open tab — goes away with the subcommands. `play` takes a file. A recording whose tab is still open is reached by the same `.cast` path its recording always had, and `open` still reaches it without the command at all.

## Design decisions

**`play` dispatches through the extension registry, the way `open` does.** The command resolves the target, reads its extension, and asks the opener registry which plugin holds it. A plugin opts in by declaring `playable: true` beside the `fileExtensions` it already publishes, so "which of this plugin's types are playable" cannot drift from "which types it claims" — there is no second list to keep in step. Entry four of the pull request's backlog adds `playable` to the video and audio manifests and nothing else, which is what makes this the right seam to build now rather than a `play`-specific hard-coded `.cast` case that entry four would have to replace.

**`playable` is a flag, not a list.** A list of playable extensions alongside `fileExtensions` would be a second statement of the same fact, free to disagree with the first. A flag says "everything I claim" or nothing, and a plugin whose types are partly playable is not a case any bundled plugin has.

**`play` reports in the transcript, not the notifications feed.** `open`, `video`, and `audio` all report a refusal where the command was typed; the feed is for background events. The removed `replay-unavailable` event and its format case go with the subcommands — nothing raises it any more.

**The core-route mechanism is removed rather than left inert.** `coreRoutes`, `resolveCoreRoutes`, `runCoreRoute`, and `src/plugins/core-route-claims.ts` have exactly one user today: the two subcommands being deleted. `play` needs no token claim, because it dispatches by file type rather than by command subcommand. Keeping a documented declaration field and a host method that nothing calls would be contract surface and code that can only rot, so the plan says outright that they go, along with the spec and developer-documentation sections that describe them.

**The rename is total.** Plugin id, `tabLabelPrefix`, the tab title (`replay: devbox` becomes `asciicast: devbox`), the payload type and its schema-version constant, the intent table's plugin name, every server and client module and test file, the plugin's own CSS class names (`.replay-*` to `.asciicast-*`), and every prose reference in specs and documentation. A half-renamed plugin is exactly what the entry asks not to ship. `web/src/plugins/api.ts`'s comment naming the replay player is the one client-side file outside the plugin that mentions it.

**The client's shared contract moves with the directory.** `@shared/plugins/replay/shared` becomes `@shared/plugins/asciicast/shared`; the plugin import boundary rule keys on the shape `@shared/plugins/<name>/shared`, not on the name, so it needs no change.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| Path resolution `play` needs — `~` against the launch dir, relative against the tab's cwd | `expandUserPath` in `src/paths.ts`, as `runOpenCommand` uses it |
| Extension → owning plugin, built from the claims that survived conflict rejection | `pluginOpeners` / `openerForExtension` in `src/openers/index.ts` |
| The guarded path from a core command into a plugin's own inline opener | `TabPluginHost.runOpener`, which `OpenFileManager.buildContext` already calls |
| The delegation body `harness` and `ssh` use, so the input is recorded before the tab is built | `runDelegated` in `src/commands/delegated.ts` |
| The `video` / `audio` commands, whose pinned-opener refusal is the wording `play` matches | `src/open/file-command.ts` (`pinnedOpenerRefusal`), `src/plugins/video/activate.ts` |
| The label recovery from a recording's filename, unchanged by the rename | `replayLabelFromFilename` in `src/plugins/replay/activate.ts` |

## Proposed changes

### The plugin rename

`src/plugins/replay/` → `src/plugins/asciicast/` and `web/src/plugins/replay/` → `web/src/plugins/asciicast/`, with `git mv` and these renames inside them:

| Before | After |
| --- | --- |
| `replayManifest`, id `replay`, `tabLabelPrefix: 'replay'` | `asciicastManifest`, id `asciicast`, `tabLabelPrefix: 'asciicast'` |
| `REPLAY_PAYLOAD_SCHEMA_VERSION`, `ReplayPayload`, `isReplayPayload` | `ASCIICAST_PAYLOAD_SCHEMA_VERSION`, `AsciicastPayload`, `isAsciicastPayload` |
| `defineIntents('replay', …)` | `defineIntents('asciicast', …)` — which is the rejection wording `unknown asciicast intent "…"` |
| `replayLabelFromFilename`, title `replay: <label>` | `asciicastLabelFromFilename`, title `asciicast: <label>` |
| `coreRoutes: ['replay']` | dropped; `playable: true` added |
| `ReplayTab.tsx`, `ReplayMeta.tsx`, `useReplaySource.ts`, `useReplayTerminal.ts` (+ their tests), `replay.css` | `AsciicastTab.tsx`, `AsciicastMeta.tsx`, `useAsciicastSource.ts`, `useAsciicastTerminal.ts`, `asciicast.css` |
| `ReplayTerminal`, `ReplaySource` types; `.replay-*` CSS classes | `AsciicastTerminal`, `AsciicastSource`; `.asciicast-*` |

`src/plugins/catalog.ts`, `src/plugins/loaders.ts`, and `web/src/plugins/registry.tsx` follow the id.

### The `play` command

`src/commands/play.ts` holds `PLAY_USAGE`, `parsePlay`, and the `Command` entry — `name: 'play'`, `match: /^play\b/i`, `samples: ['play', 'play devbox.cast']` — registered in `src/commands/index.ts` beside `open`. Its `run` delegates through `runDelegated`, like `harness` and `ssh`.

`src/play/run.ts` holds the body: parse, resolve the target against the invoking tab, then

1. no target → `Usage: play <file>.` in the transcript;
2. no plugin claims the extension, or the one that does is not `playable` → `play: <target>: not a playable file`;
3. no such file → `play: <file>: no such file`, mirroring `open`;
4. otherwise `managers.plugins.runOpener(pluginId, 'inline', file, { label, command })`.

`src/openers/index.ts` gains `playablePluginForExtension(extension)`, and `src/plugins/opener-adapter.ts` gains `playablePluginIds(declarations)`, both composed from the **accepted** openers rather than the raw catalog, for the reason `pluginContentTypes` already gives.

### Removing the two subcommands

- `src/harness/command-parse.ts`: drop `replay` from `HarnessParsed` and from `parseLabelSubcommand`, which returns to two uniform branches.
- `src/harness/manager.ts`, `src/ssh-manager.ts`: drop the dispatch arms.
- `src/ssh.ts`: delete `parseReplay` and the `{ replay: true; target: string }` variant — `replay` goes back to being an ordinary hostname.
- `src/harness/subcommands.ts`: delete `replaySubcommand` and the `notify` import it was the only user of.
- `src/harness/replay-target.ts`, `src/harness/replay-lookup.ts`, `src/harness/replay-target.test.ts`, `src/harness/replay-subcommand.test.ts`: deleted. `HarnessManager.recordingPathOf` stays — the host's `isRecordingLive` capability reads it.
- `src/notifications/index.ts`, `src/notifications/format.ts`: drop `replay-unavailable`.

### The core-route mechanism

- `src/plugins/api.ts`: drop `coreRoutes` from `TabPluginDeclaration`, add `playable?: boolean`.
- Delete `src/plugins/core-route-claims.ts`.
- `src/plugins/host.ts`: drop the `coreRoutes` field, the `resolveCoreRoutes` import and its constructor line, and `runCoreRoute`.
- `src/plugins/host.test.ts`: drop the `tab plugin core routes` describe.

`ROUTE_NAMES` in `src/plugins/command-adapter.ts` stays — it still reserves `shell` against plugin **command** claims.

### Tests

`src/play/run.test.ts`, mirroring `replay-subcommand.test.ts`'s shape:

- **routes a `.cast` file into the asciicast plugin's inline opener**, and records the command line in the transcript first — the guarded `runOpener` path with `{ label, command }` as the origin.
- **resolves a relative target against the invoking tab's working directory** and an absolute one against itself, so `play demo.cast` in a workspace and `play ~/rec/demo.cast` both reach the file.
- **refuses an extension no plugin claims** (`play notes.txt`) with `not a playable file` and opens nothing.
- **refuses a plugin-owned extension that is not playable** (`play photo.png`, which the image plugin claims) with the same wording — the case that separates the flag from "any plugin opener".
- **refuses a missing file** with `open`'s wording, before the plugin is asked to do anything.
- **`play` with no target** answers `Usage: play <file>.`
- **resolves the extension case-insensitively**, so `play DEMO.CAST` routes.

`src/plugins/asciicast/activate.test.ts` (the renamed file) replaces the `claims no command of its own, only the core route the two commands name` case with one pinning `playable: true`, no `command`, and no `coreRoutes`; and the opener registration case pins `openerForExtension('.cast')?.name` to `asciicast`.

`src/openers/index.test.ts` — new, if none exists — covers `playablePluginForExtension`: `.cast` resolves, `.png` does not (claimed, not playable), `.txt` does not (a core opener, no plugin), and `.CAST` resolves.

`src/commands.test.ts` needs no change: the new entry's samples are walked by the priority describe that already exists.

### Specs

- `product/specs/harness-recording.md` § Retrieval: `play <file>` replaces both subcommands, the label form goes, and "the replay tab" becomes "the asciicast tab".
- `product/specs/harness.md`: delete § Replay, fold `play` into the session-recording section, and drop the four notification-feed refusals that no longer exist.
- `product/specs/ssh-tab.md`: `ssh replay <label|file.cast>` becomes `play <file>`; the refusal set is not restated there.
- `product/specs/tab-plugins.md`: replace the core-routes paragraph with the `playable` claim, and rename § Bundled replay plugin to § Bundled asciicast plugin.
- `product/specs/notifications.md`: check whether `replay-unavailable` is listed; it is not, so nothing to remove there.

### Documentation

- `help.md`: a `play` row; `harness replay <name|file.cast>` and `ssh replay <name\|file.cast>` come out of the `harness` and `ssh` rows.
- `documentation/user-documentation/tab-types/recording-player.md`: `play <file>` throughout, "replay tab" → "asciicast tab".
- `documentation/user-documentation/advanced-agents/harness.md`: the `harness replay` / `ssh replay` blocks in § Playing a recording back and § Recording an SSH session.
- `documentation/developer-documentation/tab-plugins.md`: the `coreRoutes` row and worked example come out; `playable` is added to the declaration table. This is developer documentation rather than user documentation, but it describes a contract this change removes, and leaving it would state a field that no longer exists.

## Out of scope

- **Reaching a recording by name.** `play devbox` with no path, and the `.janissary/recordings/` search, are a separate backlog entry and the reason this plan only takes a file.
- **`play` with a video or audio file.** The `playable` seam is built and only the asciicast plugin sets it; the video and audio manifests are not touched here.
- **Glob expansion** for `play`. `open`, `video`, and `audio` accept wildcards; `play` takes one file, and adding expansion later is additive.
- **`open` on a `.cast` file**, which already reaches the asciicast tab through the extension claim and needs no change.
- **Recording agent tabs**, which is its own backlog entry.
- The player itself: transport, timing, live following, terminal sizing, text selection. None of it moves.
- Playback state, which is not kept after a tab closes today and is not kept after this change.

## Verification

`./scripts/run.mjs check-diff`.