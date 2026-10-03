# In-app asciicast playback

**Complexity: 7/10** — a new bundled plugin on both sides, three additive additions to the published plugin contract with a doc-parity test and fifteen client fixtures that depend on the second one, a recording format migration in both directions, a new client-to-server message, and real concurrency on the client: a playback clock driving a terminal reconstruction, frame stepping, and polling a file that is still being appended to.

Every named-harness and ssh tab is already recorded automatically to an asciicast `.cast` file under
`.janissary/recordings/`, and `harness-recording.md` § Retrieval recorded that nothing in the app could
reach one: the files were replayed outside the app with `asciinema play`, so the only in-app answer to
"what did that session do" was the one-shot `harness capture` text snapshot. This adds a `play` command
and a bundled **asciicast** tab plugin that plays such a recording — the iTerm2 Instant Replay and
asciinema player interaction the app has no route to.

The player is a bundled tab plugin, so its code ships in its own lazy chunk, it fails in isolation, and
it is reachable the way every other media tab is. Three additive additions to the v1 plugin API get it
there: an optional **`playable`** flag on the declaration, because `play` is a core command a plugin
cannot claim and needs a way to say which of its claimed file types are things to play; a
**`copyText`** client capability, because selecting and copying out of the playback is part of the
feature and a concrete client plugin may not reach the host's clipboard helper; and a read-only
**`isRecordingLive`** server capability, because a recording cannot say whether its session is still
running — one ended by closing its tab carries no exit event — and only the tab that is still there
knows.

## Design decisions

**The player is a bundled tab plugin, reached by a new `playable` declaration flag.** A plugin claims a
command word, a file extension, a web target, and a notification topic; it has no way to say "the
`play` command may dispatch a file of my type into me", which is exactly what a plugin owning the
`play` command name cannot do — `play` is a built-in, so a plugin may not claim it. The declaration
therefore gains an optional `playable`, meaning *every* extension in the `fileExtensions` the plugin
already publishes is something `play` may dispatch to its inline opener. A flag rather than a second
list of extensions, so the playable types cannot drift from the claimed ones, and one whose default
answer is "this plugin is not a player". It is additive and optional, so `TAB_PLUGIN_API_VERSION` stays
at 1 and the frozen `fixture-v1` plugin is unaffected.

**`play` resolves a file the way `open` does and asks the same registry.** `play <file>` expands `~`
against the launch directory, resolves a relative path against the invoking tab's cwd, reads the
extension, and asks `playablePluginForExtension` — which answers from the accepted plugin openers, so a
declaration refused for a duplicate extension claim is unreachable — for the plugin that owns it. The
file then goes to that plugin's `opener.inline` by the guarded, budgeted, failure-isolated path `open`
uses. `video <path>` and `audio <path>` already end at those same openers, so `play clip.mp4` opens the
tab `video clip.mp4` opens and `play track.mp3` appends to the playlist `audio track.mp3` appends to,
and there is one resolution rule rather than two.

**A target carrying an extension is answered by type before any file is looked for.** A `.txt` or a
`.png` is `not a playable file` whether or not a file of that name exists, which is what keeps an
image viewer — which owns `.png` and plays nothing — out of `play` without the command knowing which
plugins are players. A target carrying *no* extension is a recording name rather than a type, and is
resolved by the directory search below; nothing else could resolve one.

**A file that is not there falls back to the recordings directory, for a recording name only.** The
recorder appends an ISO timestamp to every recording's filename, so the file's own name is the one
thing a user does not have, and naming the session is how the retired `harness replay <label>` reached
one. `play` therefore searches `.janissary/recordings/` — reading the path back from the module that
owns it rather than re-deriving it — for the target's *stem*, its filename with any `.cast` suffix
removed. Two things answer, in order: the session's own recordings, `<stem>-<stamp>.cast`, of which the
most recent is taken, since the stamp is fixed-width digits and dashes and ordering those names
lexically *is* ordering them in time; and then a file of exactly the name asked for, which is how a
recording another tool wrote is still reached. The pattern is anchored to the shape
`harnessArtifactFilename` writes rather than being a prefix, so `play devbox` never reaches
`devbox-2`'s session. Only a `.cast` or extensionless target is searched at all, so a missing
`home.mp4` is missing rather than answered by a session called `home`. The fallback is a fallback: a
path that is already there is played as written.

**Refusals are lines in the transcript, not the notifications feed.** A command the user just typed is
not a background event, so `play` reports the way `open`, `video`, and `audio` report theirs.
`Usage: play <file>.` for no target, `play: <path>: no such file.` for a file that is not there and no
recording of that name, and `play: <file>: not a playable file.` for a type nothing plays. All three
are decided before any tab exists. A recording that is there but that the player cannot read is a
different moment: the tab opens, its metadata line carries the reason, and nothing is posted anywhere,
because the reason is the focused tab's own state and is already on screen.

**The recorded grid is authoritative, nothing is scaled, and what does not fit is clipped.** The
terminal is created at the columns and rows the session ran in, with no fit addon — fitting would
resize the grid, which is the one thing that must not change — and each recorded resize is applied at
its own timestamp. The font is the app's own `--terminal-font-size`, read the way `useXterm` reads it,
falling back to 13.5; nothing observes the container, so a recording is the same text at the same size
in a wide centre tab and a narrow sidebar. Overflow is hidden on the stage *and* on xterm's viewport,
because xterm's own stylesheet gives the latter `overflow-y: scroll` unconditionally and a single
override would still leave a scrollbar inside the terminal on any platform that gives one width. A
hidden-overflow element is still scrollable programmatically, which is what keeps xterm's
cursor-follow working. A viewer who wants the whole recording resizes their window.

**Playback starts at the first recorded frame, running, the way `asciinema play` does, and the clock
renders every frame it reaches.** The interval asks the one `show` path — which clamps a time to the
recording, moves the clock's mirror, publishes the position, and calls the terminal's `renderUpTo` — so
the transport and the screen cannot come apart. Twenty renders a second is the cost and
`renderUpTo` is written for it: it resumes from an index into the timeline rather than walking from the
start, so a tick crossing no event does no work. A recording still being written is **followed** and
holds at the end of what has been recorded rather than reporting the playback finished, because the
session may still be running.

**Playback follows the recording while the source session is still writing.** The client reads the
served file through the tab's own `/open/` reference, appending only what is new: a `fetch` carrying
`Range: bytes=<last-seen>-` is the whole mechanism, and the platform does the rest — the route already
answers single-range requests through `parseByteRange`, so following a live session costs no server
change and a long recording is read once rather than re-fetched. A partial trailing line is held until
the rest of it lands. Polls run on a 750 ms `setTimeout` chain rather than an interval, so a slow
response can never overlap the next one, and stop while the tab is not visible; a session that is quiet
for minutes and then speaks again is still followed, because a poll returning no bytes is a normal
answer and not a signal to give up. A request for a window at or past the end comes back `416`, which
`parseByteRange` calls `'unsatisfiable'`, and is read as no new bytes rather than as a failure.

Reading and polling are two effects, because two different things change and only one of them is rare.
The served reference changes once, when the tab opens, and owns the parser, the byte offset, the
decoder, and the one whole-file read; visibility changes every time the user switches tabs, and owns
only the poll chain, which runs against those same objects without touching them. Hiding a tab
therefore costs one timer, and showing it again resumes with a ranged read from the offset it reached
instead of fetching and re-parsing the whole recording a second time. Each chain carries its own
cancellation flag, so a cleanup from an earlier visibility value can only stop the chain that effect
started.

**The transport is play/pause, speed, frame step, and seek, plus text selection and copy.** Frame
stepping moves one recorded event at a time, clamped at both ends, and steps from the frame on screen,
so stepping back from a position sitting exactly on an event lands on the one before it. Speed runs
through 0.5×, 1×, 1.5×, 2×, 3×, and 4×, starting at 1×. Seeking backward resets the terminal and
replays the recorded bytes up to the target, which is the only way a terminal can be reconstructed at a
past frame at all; a long recording therefore costs a full pass on a backward seek, and that is
accepted rather than papered over with checkpoints. Every control is a button as well as a chord —
Space or `p` plays and pauses, `,` and `.` step, `[` and `]` change speed — so nothing is keyboard-only.
Each chord is deliberately unshifted, so none can collide with a key the terminal underneath already
claims. **A chord is declined only for a place text can actually be typed into**, which the
application's own `isTextEntryElement` answers: a text-ish input, a textarea, or anything
contenteditable. Clicking the recording — the first thing anyone does with a player — hands focus to
the textarea xterm keeps hidden for composition, and that is the terminal's own bookkeeping rather
than a field a person is typing into, so it is exempted by class name and the chords survive the
click. The same predicate is what stops the seek bar, an `input[type=range]`, from swallowing chords
while it holds focus, which a tag-name test cannot tell from a text field. This tab holds no field of
its own, so nothing else in it can claim a key. **There are no markers**: a marker is a
named point in one viewing session with nothing to select, copy, or share, and leaving it out keeps
the player's state to a position and a speed.

**A recording plays at the timing it was recorded at, and no idle limit is written or read.** The
recording is the only record of what a session did: compressing its silences makes a run that waited ten
minutes indistinguishable from one that answered in ten seconds, and the player would then be showing a
timeline the session never had. So neither half of an idle limit exists — the recorder does not write
`idle_time_limit`, and the reader does not look for it, which is the same thing it already does with
`env` and every other key the format permits and this app does not use. A `.cast` written by a current
asciinema carries a limit and still opens; `asciinema play` applies its own.

**The tab is dockable and lays out for a narrow sidebar like the other player tabs.** Placement is
host-owned and arrives through the `dock` capability the tab body reads; the metadata line and transport
row wrap rather than overflow, which is the same accommodation the audio and video tabs make. The body
renders no close control: the strip's × and `Cmd+W` already do it.

**Playback pauses when the tab is not the visible one and resumes where it stopped.** A plugin tab
stays mounted while hidden, so a hidden tab would otherwise keep writing bytes to an off-screen
terminal. The host's `active` answer is the only permitted source for that, never the DOM.

**Selection and copy go through a new `copyText` client capability.** xterm.js gives the selection but
no clipboard write, and a concrete client plugin may not import the host's copy helper. Adding `copyText`
to the client capability set keeps one copy implementation — the host's, with its fallback chain — in
the app rather than a second one inside a lazy chunk, and is additive within v1. It is a required member
of `TabPluginClientCapabilities`, exactly as `resourceUrl`, `dock`, and `close` are, so every fixture
that builds the object needs the new member: the fourteen existing ones under `web/src/plugins/` —
found by grepping for `copyText:`, which is where a fixture spells the member it adds — one of which is
the frozen `fixture-v1` compatibility test, plus the asciicast tab's own.

**The plugin owns its own terminal setup.** A concrete client plugin may import its client API,
`../shared.css`, and its own shared contract, so the chunk creates its own xterm terminal and drives it
from the parsed recording rather than reusing the host's PTY-bound hook (`web/src/shared/terminal/useXterm.ts`
is out of reach of a plugin, and its PTY attach is not what a recording player needs anyway). That is
why copy had to become a capability rather than an import. The terminal is themed from the recording's
own `fg` and `bg` when the header carries them and from the document root's `--terminal-fg` and
`--terminal-bg` when it does not, the way `useXterm` reads them, so a playback is themed like the
terminal it stands in for.

**Everything the header carries is read on the client, so the payload stays a file reference.** The
command, the tab label, the session start time, and the dimensions are all in the first line of the
file the client fetches anyway, so the payload is the ordinary file-tab payload every media plugin
uses. The tab title is `asciicast: <label>`, taken from the file's name with its recording timestamp
suffix removed — the artifact naming scheme already encodes the label — falling back to the whole stem
for a file that does not follow it, so the same name reads correctly however the file was reached.

**A live badge reports the session, not the last thing it said.** The metadata line reads
`claude · devbox · started 14:32:05 · 12m 30s · live` — the recorded command, the recorded title, the
recorded start time, the duration of what has been recorded, and a badge — for as long as the session
writing the recording is still running, and shows the same duration without the badge once it is not.
The badge cannot be derived from the polls: no new bytes means the session is *quiet*, which for an
agent between two prompts is its normal state for minutes at a time, and reading that as an ending
made a running session indistinguishable from a finished one. Only the host can tell the two apart,
since it owns the recorders, so the plugin asks it — through the `isRecordingLive` capability the
opener already used, reached from the client by one intent taking no argument, because what it answers
is a property of the tab's own recording. The question is asked only where it cannot be settled
locally: a poll that brought bytes is proof the session is running, and a recording carrying its own
`x` event settles it outright. It is asked once and then taken as final, because a session cannot
resume writing a recording the host has stopped watching, and a host that fails to answer is not a
host that said no — a recording in progress is never declared finished because a question could not be
delivered. A recording carrying an exit status gains `exit 0` after the duration. Size is deliberately
absent: the duration is what a viewer of a recording wants next to a seek bar, and `size` is carried
in the payload for every file-backed tab whether or not it is shown.

**A degenerate recording opens as the player it is.** A header with no events, or a final line
truncated by a recording still being written, renders the metadata line and transport over an empty
grid with the reason on the metadata line, rather than replacing the tab body with a notice.

**The command bar is the only route.** Nothing is added to a harness or ssh tab's header; every other
tab-opening route in the app is a command, and this one is too. `.cast` is claimed as a file extension,
which is what makes `open <file>.cast` and a file navigator double-click reach the player as well, and
what gives the served file a real content type instead of `application/octet-stream` — the declaration's
claim reaches `MIME` through `pluginContentTypes` with no table edit.

**New recordings are written as asciicast v3, and the player reads v2 and v3.** v3 is what
`asciinema rec` writes by default and what `asciinema play` supports alongside v2
(https://man.archlinux.org/man/extra/asciinema/asciinema-play.1.en), so a recording made by a current
asciinema becomes replayable here. v3 nests the dimensions under `term`, makes each event an interval
since the previous one rather than an absolute elapsed time, allows `#` comment lines, and adds an `x`
event carrying the session's exit status (https://docs.asciinema.org/manual/asciicast/v3/). The writer
drops `env` because the terminal type is where `TERM` now lives, and the reader dispatches on the
header's `version` so a v2 file's absolute times and top-level dimensions and a v3 file's intervals and
`term` object both produce the same timeline. An unrecognized `version` is refused with the reason on
the tab's metadata line rather than half-parsed. v1 is not read: this app has never written it.

**A recording carries the session's exit status.** The recorder receives it on the `pty` exit event and
writes v3's `x` event for exactly that, and the player shows it on the metadata line as `exit 0`.
Getting there needs the write to happen before the recorder is torn down, and two listeners watch
`pty:exit`: the per-PTY recorder, and the runtime registry that releases a harness or ssh runtime as
soon as its PTY ends. The registry is built with the manager and the bus dispatches listeners in
registration order, so the registry's listener always ran first, disposed the runtime, and left the
recorder's own listener with no stream to write into — the status was received and dropped, and no
`.cast` file this app wrote had ever carried one. The registry therefore releases from a microtask,
after the dispatch carrying the event has finished, capturing the entry it means to release so an
attach reusing that id in the meantime is not dropped in its place. Releasing as soon as the PTY exits
is what keeps a detached remote harness's `kill` off the far side, so the subscription stays and only
its timing moves. A recording ended by closing its tab or quitting the application has no exit status
— the spec is explicit that closing the tab is enough — and none is invented for it.

**The recorded foreground and background are captured, and nothing else is.** asciicast carries a
`theme` of `fg`, `bg`, and a palette, but this app themes only the first two: `useXterm` passes
`{ background, foreground }` to xterm and nothing else, so the 16 ANSI colours are xterm's built-in
constant and are identical on every recording this app makes. The server cannot read the values — they
live only as `--terminal-fg` and `--terminal-bg` in `web/src/theme.css` under each `[data-theme]`
block, and the server knows only the theme's name — so a small one-way client message carries the two
resolved values once per terminal, validated as plain hex at the point of use because they end up in a
recording's header and are handed to a terminal emulator. The player renders a recording under its
recorded colours and falls back to the current app theme's when the header has none. No palette is
written, which makes the recorded `theme` incomplete against v3's requirement that all three attributes
be present; the reader treats any subset as valid, and the recording spec says so rather than implying
a fuller fidelity than exists. The honest scope of the win is narrow and worth stating plainly: a
playback matches its original unless the app theme changed between recording and playback.

**The terminal is created once, when the header gives it the recorded grid.** The recorded dimensions
come from the asciicast header, which the client has to parse to read the file at all, so there is no
fallback grid to create first: a terminal that does not exist yet is a state the hook's `renderUpTo`
already handles by doing nothing, and a recording whose header never parses has no recorded grid and
already says why on its metadata line. Creating it once matters beyond the flash, because the hook's
cursor records how far the terminal has been fed and a terminal rebuilt under it would skip every event
written before the rebuild; the cursor is reset where the terminal is constructed, as well as where a
backward seek resets it, so no future rebuild can silently drop output.

**Four researched gaps are declined and stay out of scope**, each already considered against the plan: a
per-frame wall-clock timestamp (iTerm2's Instant Replay "shows you the exact time that something appeared
on your screen down to the second", https://iterm2.com/documentation-highlights.html) would be a second
clock in the transport row and the seek position already says where you are; loop playback
(`asciinema play --loop`) is a control the deliberate hold-at-the-end behavior makes unnecessary for a
recording a user is studying; appending rather than splitting a reattached session's recording
(`asciinema rec --append`) changes what is recorded rather than how a recording is replayed; and idle
compression (`idleTimeLimit`, which asciinema's player documentation does recommend) is declined for the
reason recorded above.

**Recording agent tabs is out of scope.** An agent tab's shell is a piped child by default, or a
transport PTY whose bytes never reach the `pty` channel the recorder subscribes to, so recording one
needs a second input seam on the recorder, sentinel-line stripping, a third runtime install site, and
two tab-shape gates relaxed — a feature rather than a fix. `product/backlog/features.md` records it under
`## deferred` rather than this feature expanding to cover it.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| The closest whole-plugin model — manifest, shared contract, activation, opener, client body | `src/plugins/video/`, `web/src/plugins/video/` |
| Declaration type and the optional fields it already carries | `src/plugins/api.ts` (`TabPluginDeclaration`) |
| Contribution claims refused at module load, recorded rather than thrown | `src/plugins/rejections.ts`, call sites at `src/plugins/opener-adapter.ts`, `src/plugins/command-adapter.ts` |
| Guarded, budgeted, failure-isolated invocation of a plugin opener — what `play` dispatches through | `src/plugins/host.ts` (`runOpener`), `src/plugins/invoke.ts`, `src/plugins/guard.ts` |
| The `servesContentType` test an opener uses to decide between an inline tab and the OS | `src/plugins/files.ts` |
| Static declaration catalog, literal server loaders, client chunk registry | `src/plugins/catalog.ts`, `src/plugins/loaders.ts`, `web/src/plugins/registry.tsx` |
| Plugin content types folded into `MIME` from the declaration — no MIME edit needed | `src/plugins/opener-adapter.ts` (`pluginContentTypes`) |
| The ordinary file-tab payload a media plugin's opener returns | `src/plugins/files.ts` (`fileTabPayload`) |
| Recording path construction and the artifact filename scheme `play` searches against | `src/harness/recording-file.ts`, `src/harness/artifact-name.ts` |
| The recorder that owns the file, per harness or ssh PTY, already subscribed to `exit` | `src/harness/recorder.ts` |
| The PTY exit event carrying the exit status the `x` event needs | `src/bus.ts`, raised at `src/pty.ts` |
| Where a client-to-server method is declared and how its reply kind is recorded | `src/protocol/core-rpc.ts`, `src/client-message.ts` |
| Where the client reads the terminal colours it would report, and what it passes to xterm | `web/src/shared/terminal/useXterm.ts` |
| The per-theme colour values the server cannot read, and their custom property names | `web/src/theme.css` (`--terminal-bg`, `--terminal-fg` under each `[data-theme]`) |
| Per-PTY observers and their lifetime, released on tab close | `src/harness/runtime.ts`, `src/harness/observers.ts` |
| Delegating command entries and the transcript line they append | `src/commands/harness.ts`, `src/commands/ssh.ts`, `src/commands/delegated.ts` |
| Single-range serving on `/open/<id>` — following a growing file needs no new work | `src/open/route.ts`, `parseByteRange` |
| The opener registry `play` dispatches through, and the accepted-claims list it must read | `src/openers/index.ts` (`openerForExtension`, `pluginOpeners`) |
| The `open` command's path resolution, existence check, and refusal wording | `src/open/file-command.ts`, `src/open/file-manager.ts` |
| The application's answer to "is this a place text can go", shared by the context menu and the paste capability | `web/src/shared/text-entry.ts` (`isTextEntryElement`) |
| Client capabilities, and the host object that builds them | `web/src/plugins/api.ts` (`createPluginClientCapabilities`) |
| The doc-parity test that pins the documented capability counts | `src/plugins/documentation.test.ts` |
| Client chunk registry parity gate a new plugin must satisfy | `web/src/plugins/registry.test.tsx` |
| Frozen plugin API fixture that must keep loading | `src/plugins/fixture-v1/` |
| A media tab's metadata header, transport row, and CSS to sit beside | `web/src/plugins/audio/`, `web/src/plugins/video/VideoTab.tsx` |
| Recorder test style — real bus events, real files, polled for the flushed stream | `src/harness/recorder.test.ts` |
| Plugin server test style — a `fakeCapabilities` fixture over real temp files | `src/plugins/video/activate.test.ts` |
| Plugin client test style — jsdom, a payload factory and a capabilities fixture | `web/src/plugins/video/VideoTab.test.tsx` |

## Proposed changes

### The plugin contract

`src/plugins/api.ts` gains an optional `playable` on `TabPluginDeclaration`: every extension in
`fileExtensions` is something `play` may dispatch to that plugin's inline opener. The declaration stays
pure data and carries no executable predicate, and needs no matching handler — a plugin that declares
itself playable already has an inline opener, because claiming extensions without an opener is already
a refused declaration.

Two capabilities are added beside it, both additive and optional inside v1. `copyText` on
`TabPluginClientCapabilities`, because xterm.js gives the selection but no clipboard write and a
concrete client plugin may not import the host's helper; it is a required member of the object, so
every fixture that builds it needs the new line. `isRecordingLive` on
`TabPluginServerCapabilities`, because a plugin reaches no tab list of its own and a recording cannot
say whether its session is still running. `web/src/plugins/api.ts` additionally re-exports
`isTextEntryElement` for the same reason `copyText` became a capability: the player needs the
application's answer to "is this a place text can go", and the client plugin boundary permits only
`../api`, `../shared.css`, and the plugin's own contract. It is a pure re-export rather than a new
capability, so nothing about the capability set moves.

`src/plugins/opener-adapter.ts` gains `playablePluginIds`, the set of plugin ids that said so. It
reads the catalog rather than the accepted openers for one reason: a declaration refused for a duplicate
extension claim contributed no opener, and the lookup only ever asks about an extension the registry
already resolved, so a disabled claimant can never be named. `src/openers/index.ts` composes that set
once and answers `playablePluginForExtension(extension)` from `pluginOpeners`, so `play` and `open`
cannot disagree about which plugin owns a file.

`TabPluginHost` gains nothing. `play` reaches a plugin through `runOpener(id, 'inline', file, origin)`,
which already exists, so activation, the deadline, and the failure boundary are not restated by the
command.

### The asciicast plugin

`src/plugins/asciicast/manifest.ts` declares id `asciicast`, `tabLabelPrefix` `asciicast`, payload
schema version 1, a `.cast` extension claim mapped to `application/x-asciicast`, `playable`, and only
the capabilities it uses: `openOrFocusTab`, `isRecordingLive`, `rejectRequest`, and `reportFailure`. The
declaration is what the host enforces rather than a formality — `createPluginContext` restricts a plugin
to the set its own manifest asked for, so a capability the activation calls without declaring throws on
first use and the host marks the plugin disabled with that reason. It claims no command word — `play`
is a core command — and no notification topic, because it has nothing to watch and everything it reports
is user-initiated.

`src/plugins/asciicast/shared.ts` is the import-free payload contract: a schema-version constant, the
payload type, and a hand-written guard that rejects arrays and `null` and validates every required
field, so the client guard the registry runs is the plugin's own. The payload is the ordinary
`fileTabPayload` record — `name`, `path`, `size`, `url` — plus one boolean the opener is the only thing
that can know, saying whether a live tab held this recording when the tab was opened.

`src/plugins/asciicast/activate.ts` supplies `isPayload` and an inline opener that opens or focuses the
tab keyed by the recording's path — the host's own instance-key dedupe, so playing the same recording
twice focuses the one tab and two recordings are two tabs — with the tab title `asciicast: <label>`,
where the label is derived in the same module by stripping the ISO timestamp `harnessArtifactFilename`
writes off the end of the file's stem, and falling back to the whole stem for a name that does not
carry one. The recorded label was sanitized by the rule that named the file (`[^\w-]` becomes `-`), so
the title shows the sanitized form; that is accepted rather than compensated for. The payload's
`finished` flag is the one thing the opener cannot know from the file: a recording ended by closing its
tab carries no exit event, so the host is asked which of its files a live tab is still writing, and a
false answer is treated as no answer. `src/plugins/live-recordings.ts` answers that from the tab list
rather than from the recorder registry, because the file cannot say: a recording ends when its tab
closes just as surely as when its process exits.

The activation carries one intent, `liveness`, answering whether a live tab is still writing this tab's
own recording. It takes no argument, because what it answers is a property of the recording the tab
already holds and a client must not be able to ask about another one. It is the same capability the
opener used, so the manifest needed nothing new for it.

`web/src/plugins/asciicast/` is the lazy chunk: an entry that loads the shared plugin stylesheet and its
own, a `cast-stream` pure module that parses a header of either version and turns appended text into
events while holding a partial trailing line, a `timeline` pure module holding the timeline's own
arithmetic — how long it is, which events a moment lands on — so it can be tested without a clock or a
terminal, a `useAsciicastSource` hook owning the parser, the byte offset, and the ranged fetch in one
effect keyed on the served reference and the poll chain in a second keyed on visibility, and — because
the first read's verdict about liveness can go stale — the liveness latch that effect resets, which a
poll that brings nothing clears by asking the host and which never returns; a `useAsciicastTerminal`
hook that builds the terminal once the header gives it a grid, applies the recorded colours when the
header carries them, and hands a copy to the capability; a `usePlayback` hook owning the clock, speed,
position, frame stepping, and the reset-and-replay a backward seek needs, given liveness as its
hold-at-the-end condition rather than a conjunction of the payload's opening verdict and the last
packet's size; a presentational transport bar, a metadata line carrying the facts, the `live` badge,
and the `exit` status; and the tab component that composes them. Nothing is promoted to
`web/src/shared/` — there is one consumer, and the plugin boundary would not permit the import anyway.

### The command

`src/commands/play.ts` holds the parse — the leading `play` stripped, the rest the target verbatim
because a path may hold a space — and the registry entry, with samples `play` and `play devbox.cast` so
the priority test can fail any command that shadows or is shadowed. It delegates through
`runDelegated`, the body `harness` and `ssh` already use, so the input is recorded in the transcript
before the tab is built.

`src/play/run.ts` is the command's body: parse, answer by type when the target carries an extension,
resolve the target the way `open` does, fall back to the recordings directory for a `.cast` or
extensionless name that is not there, and hand the resolved file to the owning plugin's inline opener.
`src/play/recording-search.ts` holds the matching rule, pure and filesystem-free, so the whole decision
is testable: the stem a target names, and the newest recording of that session or the file of exactly
that name.

`src/harness/recording-file.ts` gains `harnessRecordingDirectory()`, the accessor the recorder already
has by construction and nothing else could read, so `play` learns where recordings live from the module
that writes them.

`src/harness/command-parse.ts` and `src/ssh.ts` lose their label-subcommand branches, and
`src/harness/subcommands.ts` loses the replay body, so `harness replay <label>` is an unknown harness
name and `ssh replay` is an ordinary hostname again — which is the correct reading of both.

### The recording format

`src/harness/recorder.ts` gains a reader for the recording it is writing, answering with no path until
the file has actually been opened on first output, and is rewritten to write asciicast v3: the header's
`term` object instead of top-level dimensions, a `term.theme` carrying the foreground and background the
client reported, and no `env`, since the terminal type now lives in `term.type`. Each event becomes an
interval since the previous one, rounded to milliseconds with the accumulated rounding error carried
forward rather than discarded, and the PTY's exit status is written as an `x` event before the stream
closes. The header is still written lazily on first output, so output that arrives before the client's
colour report produces a recording with no theme — the same state as a recording made by another tool,
which the player already handles.

`src/harness/cast-header.ts` and `src/harness/cast-interval-clock.ts` are new: the v3 header, and the
interval arithmetic with the error carried forward. `src/harness/terminal-colors.ts` is new: the recorded
pair and the one place that decides a valid one.

`src/harness/manager.ts` gains `recordingPathOf(label)` for the host's own liveness answer, and
`reportTerminalColors(id, colors)` to hand the client's report to that PTY's recorder.
`src/harness/runtime-registry.ts` keeps releasing a runtime when its PTY exits, because that is what
stops a detached remote harness's `kill` reaching the far side, but does it from a microtask rather
than part-way through the dispatch, so the recorder — a later listener of the same event — gets to
write the exit status into its file first.

`src/protocol/core-rpc.ts` gains one client-to-server message carrying a PTY id and the two resolved
terminal colours, and `src/client-message.ts` gives it its entry in the kind table. Each terminal surface
sends it once after mounting. `src/client-params/core.ts` checks the shape and
`src/message/handler.ts` validates the two values as plain hex before forwarding them, because they end
up in a recording's header and are handed to a terminal emulator.

### Documentation

`product/specs/harness-recording.md` is the spec this changes most: § File format is rewritten for v3 —
the `term` object, the absence of `env`, the recorded `fg`/`bg` with no palette, the `x` exit event and
the recordings that have none — and § Retrieval replaces "There is no in-app retrieval command or viewer"
with `play`, the tab, the following behavior, the recordings-directory search, and the refusals.
`product/specs/open.md` gains § `play` command beside § `open` command.
`product/specs/harness.md` and `product/specs/ssh-tab.md` replace the subcommands with `play`.
`product/specs/tab-plugins.md` gains the playable contribution in place of the core-route one, and its
bundled-plugin sections name the asciicast plugin and the video and audio plugins' playable types.
`product/specs/video-tab.md` and `audio-tab.md` gain `play <path>` beside the routes they already list.

`documentation/developer-documentation/tab-plugins.md` documents the declaration field, adds `copyText`
to the client capability list, and records both as additive within v1 in the API changelog. That
changelog sentence is a test's subject, not just prose: `src/plugins/documentation.test.ts` asserts the
document contains the server capability count word followed by the literal client count, so the
sentence's `seven client capabilities` becomes `eight` and the test's literal moves with it.

`documentation/user-documentation/advanced-agents/harness.md` and a new
`documentation/user-documentation/tab-types/recording-player.md` describe the player and the command
beside `video-player.md` and `audio-player.md`; `tab-types/video-player.md` and `audio-player.md` each
gain `play` as another route to the tab they document. `help.md` gains a `play` row and loses the replay
text from the `harness` and `ssh` rows, and gains an asciicast tab controls table for the five chords.

### Ordering

The two additions to the plugin contract land first and on their own, with the doc-parity and fixture
updates, so `check-diff` is green before anything depends on them. The recording format change lands
next — the recorder's v3 header, its intervals, its `x` event, and the client message carrying the
terminal colours — because it is server-side and nothing else in the change depends on it, and it is the
piece most likely to need a second attempt at its rounding. Then the command and its directory search,
and the client chunk last, because the player is the only part that must read both format versions at
once. Nothing here waits on another plan.

## Tests

Server, colocated:

- `src/harness/recorder.test.ts` — the reader answers with nothing before the first output and with the
  written file's path after it; the header is a v3 header carrying `term` with the reported colours and
  no `env`; a first output arriving before the colour report produces a header with no theme; a resize
  event carries the same interval encoding as an output event; a PTY exit writes an `x` event carrying
  the exit code before the stream closes, and a recorder disposed without one writes none; and the
  written intervals sum to the real elapsed time rather than drifting, which is the property the format's
  error-diffusion advice exists to protect. All in the existing real-files style. Two further cases run
  a recorder *behind* a real `HarnessRuntimes`, which is the only wiring in which the exit event ever
  arrives: the registry is built first, as it is in the running app, and the `x` event must still be the
  file's last line, while a runtime released by a tab close writes none. The bare `x` case cannot see
  this, which is why the passing test was what hid the loss.
- `src/harness/runtime-registry.test.ts` — a runtime installed under an id between the exit and its
  release survives, so an attach that reuses the id is not dropped in its place. The existing exit cases
  await the dispatch rather than asserting synchronously, because the release is now deferred.
- `src/client-message.test.ts` — the new terminal-colours message is accepted, and its two colours are
  validated as colour strings rather than stored as whatever arrived.
- `src/plugins/asciicast/activate.test.ts` — the `.cast` extension resolving to the plugin through the
  real opener registry, the tab named after the label the file was named for, a stem without a stamp
  keeping its whole name, the payload's shape and served reference, a `rejectRequest` on a file the
  plugin will not serve, the absence of any external presentation, an unknown intent name rejected
  against a real payload, an argument to the argument-less intent rejected, the `liveness` intent
  answering from the host for the recording its own tab holds, and the liveness cases. The liveness
  cases build their context through `createPluginContext` from the real manifest rather than by hand, so
  the capability the payload asks the host for is answered under the declaration the plugin ships: with
  `isRecordingLive` undeclared that context throws and the cases fail, which is the only check in the
  suite that asks what the manifest grants. The other cases keep the hand-built capability object, which
  is the right tool for stubbing a capability's answer directly. The registration case pins `playable`
  true, no command, and no `coreRoutes` key at all.
- `src/harness/recording-file.test.ts` — `harnessRecordingDirectory()` answers the directory that was
  initialized, and the empty string before one was.
- `src/harness/command-parse.test.ts` and `src/ssh.test.ts` — the retired `replay` word reads as an
  unknown harness name and as an ordinary destination, so neither can be read as a retired subcommand.
- `src/openers/index.test.ts` — `playablePluginForExtension` answers each playable plugin for its own
  containers, matches case-insensitively, and answers undefined for a plugin-owned extension that is not
  playable and for one a core opener claims.
- `src/play/recording-search.test.ts` — the stem a target names; a session answered by its label alone
  and the most recent of several taken; one session's name never answering for another's; a file of
  exactly the name asked for; a recording of the session preferred over a bare file of the same name;
  the name matched literally rather than as a pattern; and nothing answered for a name the directory
  does not carry.
- `src/play/run.test.ts` — a recording routed into the asciicast plugin through the guarded opener path,
  a relative target against the tab cwd and an absolute one against itself, a target holding a space
  taken whole, the extension read case-insensitively, an extension no plugin claims refused, a
  plugin-owned extension that is not playable refused, a missing file refused in `open`'s wording before
  the plugin is asked for anything, and the usage line for a bare `play`. Then the recordings-directory
  fallback: a recording reached by the name the user knows, by its bare label, and the most recent of
  several; an existing path still played as written; a name nothing answers refused; a named extension
  still refused by type whatever the directory holds; and a missing file of another playable type not
  answered by a same-named session. Then video and audio: a video and an audio file routed to the plugins
  that play that kind of thing, and an external-only container handed to its plugin.
- `src/open/file-manager.test.ts` and `src/file-navigator/openers-for-row.test.ts` — `open <file>.cast`
  driven through the real command asks the asciicast plugin's inline opener for the resolved file, and a
  `.cast` row activates with `open` and leads its forced chooser with `Open as asciicast`.
- `src/plugins/fixture-v1/` continues to load unchanged, which is what keeps both additions inside v1.

Client, colocated:

- `web/src/plugins/asciicast/cast-stream.test.ts` — a v2 header parses into the same timeline a v3
  header does, with v2's absolute times and v3's intervals and `term` dimensions; output and resize
  events parse; a trailing partial line is held and completes when the rest arrives; `#` comment lines
  are skipped; an unknown `version` yields the reason the metadata line shows; and a recorded `fg`/`bg`
  with no palette parses as far as it goes. The fixtures keep their `idle_time_limit` — a foreign
  recording has one — and stop expecting it back, which is the pin that such a file still parses.
- `web/src/plugins/asciicast/timeline.test.ts` — the length of a recording as written, the events a
  moment needs fed to it, and the event a step lands on from the frame on screen, clamped at both ends.
- `web/src/plugins/asciicast/usePlayback.test.ts` — play and pause, the clock advancing **and the
  terminal advancing with it** under fake timers, the last frame left on screen at the end, speed
  scaling, a frame step forward and back landing on the event boundary, a backward seek reconstructing
  the frame, reaching the end holding rather than finishing, and a recording playing at its recorded
  timing — a ten-minute-gap timeline reporting 602 seconds rather than a compressed one, with no
  parameter left to ask for compression.
- `web/src/plugins/asciicast/useAsciicastSource.test.ts` — the first read, a ranged read from the last
  offset, a poll returning no bytes leaving the timeline unchanged, polling stopping when the tab is
  hidden and resuming when it is shown, and a 416 being read as no new bytes. The hide-and-show case
  asserts the range offset rather than the fetch count: after being hidden and shown again, the read
  asks for a window starting where the last one stopped instead of beginning the file again. Then
  liveness: a session gone quiet stays live while the host says it is running and stops being live once
  the host says otherwise; a poll that brings bytes asks nothing, because bytes are proof enough; a
  recording carrying its own `x` event is not live whatever the host says; a recording finished when it
  opened is never live and never asked about; and a host that cannot answer leaves the latch alone
  rather than declaring a recording in progress finished.
- `web/src/plugins/asciicast/useAsciicastTerminal.test.ts` — the terminal is built at the recording's own
  columns and rows; the font size is the document's `--terminal-font-size` with the 13.5 fallback when
  that property is unset; a recorded `fg`/`bg` themes the terminal and their absence falls back to the
  app theme; and no `ResizeObserver` is constructed, so nothing scales the font after the first render.
- `web/src/plugins/asciicast/AsciicastTab.test.tsx` — the metadata line's facts, live badge, and `exit 0`
  when the recording carries one, the transport buttons with no idle control among them, the chord
  handling, a copy going out through `capabilities.copyText`, a terminal rendered under a recorded
  `fg`/`bg` and under the app theme when the header has none, and a degenerate recording rendering the
  reason on the metadata line rather than replacing the body. The stubbed terminal hook is asserted to
  be asked for nothing before the header arrives and for the recording's own columns and rows once it
  does, which is the whole of the build-once contract. Three cases cover what the chords and the badge
  need that the others cannot reach: `.` and Space still working with xterm's helper textarea focused,
  `]` still cycling speed with the seek bar focused, a real text field still holding its chords, and the
  badge persisting through a session's silence, dropping when the host says the writing stopped, and
  never appearing for a recording that was finished at open. The older chord cases press keys with
  focus on the body, which is the state before the click rather than after it.
- `web/src/plugins/registry.test.tsx` picks up the new entry and pins its schema literal.

## Out of scope

- Markers, for the reason given above.
- Idle-time compression in either direction — neither the writer's `idle_time_limit` nor a reader of one
  nor the per-viewing control and its chord — for the reason recorded above.
- Scaling the recorded grid or its font to the pane; a recording larger than the tab is clipped and the
  window is resized.
- The four researched gaps declined during planning — a per-frame wall-clock timestamp, loop playback,
  appending a reattached session's recording, and idle compression — for the reasons recorded above.
- Any listing or picker of recordings, and a bare `play` with no target beyond its usage line.
- Reading asciicast v1, which this app has never written.
- A recorded colour palette, for the reason recorded above.
- Editing, trimming, exporting, or sharing a recording, and any way to delete one.
- Replaying an agent, editor, or other non-recorded tab; recording agent tabs is recorded in
  `product/backlog/features.md` under `## deferred` instead.
- Wildcard expansion for `play`, which takes one file; `video <path>` and `audio <path>` keep theirs.
- Reflowing a terminal when a recorded resize arrives mid-replay.
- A control on a harness or ssh tab's own header, or in the file navigator's context menu for a
  recording row.
- A client-to-server notification for a recording that cannot be parsed: the reason is the focused tab's
  own state and is already on screen, so a feed line would duplicate it.
- Persisting playback position, speed, or anything else across closing the tab.
- A new plugin API integer, a deprecation window, or any change to an existing plugin's behavior.
- Changing what is recorded, when, or where.
- The `features.md` entry this feature answers, which stays where it is: no task in this run directs
  removing a deferred entry.

## Open questions

None. Every product and implementation decision is settled; see Design decisions, each of which traces
to the feature description, established behavior, or an answer given while planning.

## Verification

`./scripts/run.mjs check-diff`, then `npm run build:web` with a chunk inspection confirming the asciicast
plugin's modules are in its own chunk and not in the entry bundle.