# Sidebar launcher tab

**Complexity: 7/10** — a first-of-its-kind docked list plugin with a config file read at two paths, plus a new host capability and an ACP session owning cross-tab reads, where the correctness work is in the sort tiers and the summarizer's flush/lifecycle rules rather than in the amount of code.

## Goal

A single dockable **launcher** tab that acts as the application's sidebar home: a rail of launch commands with icons, and a live list of every open center tab sorted by what needs attention, so a user can reach any feature or any working tab without hunting through the center strip. Clicking a command runs it; clicking a tab focuses it.

The reference shape is the Paseo sidebar (<https://paseo.sh/>): a short stack of named actions at the top, then the open workspaces underneath grouped by what they are doing right now.

There are two halves:

1. **Commands.** A vertical list of application commands, each a row with an icon and a label. Clicking a row launches the feature that command names, the same way typing it would.
2. **Tabs.** A vertical list of every open center-strip tab, sorted into five tiers by what needs attention — needs-input, unread, active, busy-inactive, idle-inactive. Clicking a row focuses that tab.

Each tab row also carries a short **status summary** written by an ACP session, in the same spirit as a monitor persona's `[SUMMARY]:` recap — a paragraph saying what that tab is doing, so the list is scannable rather than a bare list of names.

## Design decisions

**The launcher is a tab plugin.** A bundled plugin under `src/plugins/`, with a client entry under `web/src/plugins/`, is the only mechanism that produces a dockable, live, in-memory view tab. It follows the shape of `schedules` and `sessions`: it opens on no file (claims no file extensions), is reached only by its own command, and reads its command's dock argument with the shared `parseDockArgument` grammar. "Docks into the sidebar" therefore needs no new docking rule — the launcher is one more dockable kind sharing the existing mechanism, and the one-tab-per-kind-per-side rule displaces a previous launcher rather than stacking one.

**Its command is `launcher`, and it opens docked left.** `launcher` opens or focuses the singleton tab docked into the left sidebar. `launcher right` puts it on the right; a bare `launcher` when it is already open refocuses it. The singleton is addressed by one stable instance key, so a second invocation focuses the existing tab instead of opening a second. Its label is `launcher`.

**Clicking a command dispatches the application command line.** The row does not reimplement any feature's placement rules: it dispatches the exact line from `launcher.json` (`notifications left`, `files`, `sessions right`, …) from the launcher tab, exactly as if typed. So `notifications left` docks the feed into the left sidebar, where the two different-kind occupants share it through the sidebar's tab-switcher rather than one displacing the other, and a feature's own reply still lands in the tab that asked.

**The launcher hosts the application's command bar.** Because it dispatches commands, it declares `hostsCommandBar` and renders the application's own bar beneath its two lists, so a dispatched command's answer or error is visible in the launcher itself, and a user can type any command straight into the rail. This is the published-bar path `tab-plugins.md` describes, not a second textarea.

**The tab list is every center-strip tab, and nothing else.** Docked tabs are omitted: a docked tab is never the active tab, and cannot be focused from here, so listing it would offer a click that cannot do what the list promises. Clicking a center tab's row focuses it through the existing `setActiveTab` RPC the center strip uses — which also starts the ordinary unread dwell, so a row read for three seconds loses its badge exactly as the strip's own.

**The rows are built on the host, not on the client — the plan's original claim that the client already holds this state is wrong and is corrected here.** A plugin body receives only its own payload and its capabilities; it never sees `App.tsx`'s `TabView[]`, because a plugin must not read the websocket client or any host state. So the host builds the rows and republishes the launcher's payload, and the client renders what it is given. This costs two additions to the published contract rather than zero, and is the reason the plan carries them.

**The `tabActivity` capability reads host tab state.** It hands a declaring plugin, per open tab, its label, display title, view kind, dock side, pane, busy and unread flags, whether it is holding a prompt or question, when it last had any activity, its working directory, its remote host when it has one, its last command line, its transcript length, and a size-capped recent transcript tail. It is a pull: the summarizer reads it at its own flush cadence rather than being handed a copy on every mutation, and the activation reads it once when the tab opens. It reads from `managers.tab.tabs` at `src/plugins/context.ts` beside `topicData` and `originTab`.

**A `tabs` notification topic republishes the payload as the rows move.** The rows change on essentially every application mutation — a transcript append moves a tab's last activity, a focus changes the active row, a badge raises a tier — and `state: dirty` is the only signal that covers all of it, so the topic subscribes to it, as `schedules` and `sessions` do to their own named channels. Delivering on every raw mutation would put a payload update and a broadcast behind every keystroke, which is precisely what `src/plugins/host-state.ts` documents and avoids by fingerprinting. So the topic's rows carry **last activity rounded down to the minute**, and the launcher's `notify` handler drops any republish whose rows are unchanged. Two appends inside one minute therefore produce identical rows and no second broadcast, while the row still reads "4m ago", because a minute-resolution rendering cannot tell the difference. The launcher is the only subscriber, the dispatcher already skips a plugin with no open tab, and one extra self-terminating broadcast per real change is the rate.

**A `tabs` topic action focuses a row.** The plugin client reaches the server only through intents, so a row's click goes intent → `topicAction({ topic: 'tabs', action: 'focus', label })` → `setActiveTab`, the same route the center strip's own click takes. It is refused for a label with no open tab, which is the same authorisation rule `sessions.focus` follows — checked against the manager's own current rows rather than against a payload the host remembers having delivered — and it is strictly narrower than the `dispatchLineWithOutput` grant the launcher already declares, whose command table contains `close <name>`.

**Last activity is a runtime stamp, not a transcript field.** A tab's activity is its own output, so it is written wherever the transcript grows — `appendTab`, `updateRunningEntry`, and `clearTranscriptTab` in `src/tab/transcript/events.ts`, which is the single writer for each — onto `TabRuntime.lastActivity`. This corrects the plan's earlier claim that it is "the timestamp of the last transcript entry": a `LogEntry` carries no timestamp, and adding one would have touched every producer, the wire projection, and every persisted shape for a value only a reader wants. The same value is minute-rounded in the payload and read exact by the summarizer as its change-detection cursor.

**A gate is remembered because nothing else can.** Whether a harness is sitting at a permission gate the user has to answer is a screen state, so it survives only if the observation writes it down. `busyStatusHandler` in `src/harness/busy-status.ts` records it on `TabRuntime.gateNeedsUser` from each capture it already holds, alongside the stuck decision the busy tracker is given — so a gate auto-approve is clearing, or a tab parked on a scheduled resume, is recorded as needing nobody — and `needsInput` reads that beside `questions.pendingFor`. A remote harness's transition arrives as a bare busy/unread pair, so a remote gate reads as idle-unread and not as needs-input — a documented limitation of the tier, not an oversight.

**The tab list is sorted into five tiers, and each tier is labelled.** In order: needs-input, unread, active, busy-inactive, idle-inactive. Tabs keep their existing center-strip order inside a tier, so a row never jumps within a tier. A small muted label sits above each tier group. The two halves of the rail carry no section headings of their own.

The **needs-input** tier is the state the launcher exists to surface, and it sits above unread, active, busy, and idle alike, the ordering Paseo uses (`needs_input → failed → attention → running → done`, `packages/protocol/src/agent-state-bucket.ts`). Without it, a blocked tab reads as busy, which is the same row chrome a working tab gets, and the one state worth interrupting for looks like the ordinary one. A tab ranks needs-input when it is holding a prompt or question *right now*: a pending agent question (`TabView.pendingQuestion`, `src/protocol/tab.ts`), or a harness blocked on a permission prompt — the state that already stops the tab's busy dot and badges it unread (`product/specs/harness.md` § Busy/ready status). Both are already on the wire, so the tier is a fifth bucket plus one field in the `tabActivity` capability's payload.

Last activity is the timestamp of the tab's last transcript entry — the same position the summarizer already tracks for its change-detection cursor, so one number covers both the row's "last active Xm ago" and "has anything new arrived". No new `Tab` field and no new writer on every mutation is needed.

**Every tab row shows the same status chrome the strip shows, plus its time:** the tab's dot color, a busy indicator, the unread flag when the server has raised one, and how long ago the tab was last active — since the sort is by status, the badge is what tells the reader why a row is where it is.

**Recency is exposed as data, not as a re-sort.** The relative time is shown on every row and re-resolves as the interval coarsens, the way a Paseo row's timestamp resolves from minutes to hours as it ages (`use-time-ago.ts`). The rows themselves stay in their stable tier order rather than being re-sorted most-recently-used-first: VS Code closed MRU *sorting* of editor tabs as not-planned (`microsoft/vscode#242846`, "this could lead to some very ugly flickering"), and the number the user actually wants — which tab was I just on — is answered by the timestamp on the row, not by the list order. No previous/next recency cycle is included in this version.

**The summary is one paragraph per tab row.** It is capped at three lines of the row's width and ends in an ellipsis when longer, expanding to as many as eight lines while the pointer is over the row. A row whose summary has not arrived, or whose summarizer cannot connect, shows no summary line at all — the launcher otherwise works normally.

**Hovering a tab row opens a small card, the way the sidebar's neighbours already preview.** It carries what the row itself has no width for: the tab's display name and label, its working directory, its remote host when it has one, and the last command line it ran — the same fields a Paseo row's hover card shows (`workspace-hover-card.tsx`: branch, path, host, PR badge, diff stat) and that Conductor added in 0.44.0 ("hover any workspace to see metadata and get easy access to next actions"). Every one of those fields already arrives in the `tabActivity` snapshot, so the card is client-rendered from data the capability already returns and adds no host state. It is hover-only chrome: it opens on pointer-over and closes on pointer-out, holds no state, and never appears on touch or keyboard focus alone.

**The command list is user-configurable in `.janissary/launcher.json`.** One array, each entry an object with an `icon`, a `label`, and a `command`:

```json
[
  { "icon": "faTerminal", "label": "New shell", "command": "zsh" },
  { "icon": "faBell", "label": "Notifications", "command": "notifications left" }
]
```

`janus init` writes the file, idempotently, and never overwrites one that already exists. A `~/.janissary/launcher.json` in the user's home directory **replaces** the project file wholesale when it exists. An absent file, an unreadable one, one that is not valid JSON, and one whose top level is not an array all fall back to a built-in default command set, and the launcher reports one line to the notifications feed naming the file and what was wrong with it, leaving the file on disk untouched. A file that is a valid array is judged entry by entry: it keeps the entries it can use — dropping one whose command, label, or icon is missing, and one whose id another entry already holds — and reports how many were lost, so a single bad row costs that row rather than the whole rail. An icon named in the file that is not a real Font Awesome name is drawn as a neutral fallback glyph with its own notifications-feed line; the command it belongs to still runs. Because an empty array is treated as no configuration at all rather than as a choice to show nothing, an empty file also yields the default set.

**The launcher's Configure button opens the file it will read.** It sits in the launcher's own plugin header, beside the application's dock control, and opens whichever file is currently in effect — the home override when one exists, otherwise the project's — in a normal editor tab, so what it opens is what it reads back.

**Keyboard navigation is arrows plus Enter.** Arrow keys move the selection within the focused list and Enter activates the highlighted row, matching the sessions and schedules lists the sidebar already hosts. Keyboard focus arriving at the docked launcher lands on the command list first, since it comes first in the rail.

**The summarizer is an ACP session the launcher's own tab runs, not a subprocess.** It is driven by a shipped persona at `ai/personas/launcher/summarizer.md`, and it is tool-less: it may read, and it may not act. It is fed, per open centre tab, a capped status snapshot — the tab's label, view kind, busy and unread state, how long since its last activity, and its last command line — together with a size-capped slice of its recent transcript, so a summary can say both that a tab is busy and what it is busy doing. The launcher's own tab is never in that set; see below. One prompt is in flight at a time.

**The summarizer's cadence is the launcher client's, and its lifetime is that connection's.** It prompts every thirty seconds — mirroring the monitor's flush cycle — for as long as a client is connected and the launcher's tab is on screen, and stops when neither holds, so a rail nobody is looking at costs nothing.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| Bundled dockable-list plugin pattern | `src/plugins/sessions/`, `src/plugins/schedules/` |
| `defineDockableList` (command + notify wiring) | `src/plugins/define-list-tab.ts` |
| `parseDockArgument` (the `[left|right]` grammar) | `src/plugins/dock-argument.ts` |
| Plugin manifest type, capability set, the v2 version rule | `src/plugins/api.ts`, `src/plugins/api-capabilities.ts` |
| Client plugin registry (lazy chunk) | `web/src/plugins/registry.tsx` |
| Docked plugin body inside a sidebar, and the shared metadata bar | `web/src/plugins/DockedPluginBody.tsx`, `web/src/plugins/PluginActionsHeader.tsx` |
| `PluginActionsHeader` / `useListSelection` for a list-shaped docked view | `web/src/plugins/api.ts` |
| Client tab state, `TabView[]` | `web/src/App.tsx` (`useState<TabView[]>`) |
| `hasUnread`, busy, dock on `TabView` | `src/protocol/tab.ts` |
| `setActiveTab` RPC (focus a center tab) | `src/protocol/core-rpc.ts` |
| Persona file format (directive, tools line, body) | `src/personas.ts`, `src/persona-parsing.ts` |
| Tool-less ACP session shape | `src/monitor/acp.ts` |
| `[SUMMARY]` marker parsing | `src/monitor/reply-format.ts` |
| Icon registry | `web/src/shared/icons.ts` |
| Config read/write, atomic replace, invalid-JSON warning policy | `src/config.ts` |
| Project scaffold written by `janus init` | `src/project/init.ts` |
| Per-tab transcript, `LogEntry` | `src/tab/types.ts` |

## Proposed changes

- `src/plugins/launcher/` — the whole server side: the manifest (command `launcher`, no file extensions, the `tabs` topic, `hostsCommandBar`, and the eleven capabilities its activation actually calls), the activation that reads the effective `launcher.json`, builds the payload, republishes it whenever the `tabs` topic fires and the rows have actually moved, and answers the `summarize` intent the launcher client raises. The activation owns the manifest's own declaration test, which reads its source and asserts the set it calls is a subset of what is declared. The summarizer lives here rather than in a top-level `src/launcher/`, because the launcher plugin is its only owner and no other feature is expected to want one — which is only possible because the one thing it needs from outside itself, every open tab's activity, arrives through a capability rather than through an import.
- A new **`tabActivity` capability** on the v2 tab-plugin contract: a pull over the host's open tabs returning each one's label, title, dot colour, view kind, dock, pane, busy, unread, needs-input, whether it is active, last activity, working directory, remote host, last command line, transcript length, and a capped recent transcript tail. It is additive, so `TAB_PLUGIN_API_VERSION` stays at 2.
- A new **`tabs` notification topic**, its rows the launcher's display rows with last activity minute-rounded, delivered on `state: dirty` and skipped when the rows have not moved; plus a **`focus` action** on that topic, refused for a label with no open tab. Both are data additions to `src/plugins/topics.ts` and `api-topics.ts`.
- A **lastActivity stamp on `TabRuntime`**, written wherever the transcript grows in `src/tab/transcript/events.ts`, and a **gateNeedsUser stamp** written by the capture handler in `src/harness/busy-status.ts`. Both are in-memory only and are the two tab facts the tier and the row need that nothing currently records.
- `web/src/plugins/launcher/` — the client entry: the command rail, the five-tier tab list with per-row summaries, timestamps, dot colours, and hover cards, the Configure button, the borrowed command bar with its own recall, keyboard navigation, and the CSS the plugin owns. The hover card is client-rendered from the `tabActivity` snapshot the plugin already receives for its rows, and is positioned against the viewport so the list's own scroll container cannot clip it.
- `src/project/init.ts` — write `.janissary/launcher.json` from the launcher's own default command list rather than a second copy of it, and never overwrite an existing file.
- `ai/personas/launcher/summarizer.md`, whose body the launcher reads itself and whose directive line it deliberately does not send.

The project root the persona file and `launcher.json` are read against comes from `originTab().root` (`src/plugins/api.ts:302`), so the plugin never receives a path it has to trust from a client.

Last activity is derived per tab on the host and carried in the same `tabActivity` snapshot as `busy` and `hasUnread`, so the client never computes a timestamp from anything but a number the server measured.

### How the summarizer works

**One tool-less ACP session, prompted every thirty seconds** by the launcher client for as long as one is connected. Each flush assembles one prompt from every open centre tab the launcher is not itself — the tab's label and view kind, whether it is busy or badged or waiting on the user, how long since its last activity, its last command line, and a size-capped recent transcript tail — and asks for one paragraph per tab in reply.

The session is primed once, on the first flush that has something to ask, with the persona file's body plus an instruction to answer in a fixed shape: one line per tab, each beginning with a marker carrying that tab's label and nothing else, then the paragraph. The reply is parsed by the same marker-capture approach `src/monitor/reply-format.ts` uses for `[SUGGESTION]` and `[SUMMARY]`, keyed on the label rather than on a fixed marker word, so a line naming a tab that no longer exists is dropped and a reply matching nothing delivers nothing at all. A tab named in the prompt but absent from the reply keeps whatever summary it already had, and a tab with no summary yet never gets a placeholder.

**Nothing is prompted when nothing changed.** The summarizer tracks, per tab, the transcript length it has already fed, and asks only when a tab's length is not the one recorded for its label. When no tab has moved, no prompt is sent at all — the same emptiness check `src/monitor/live-monitors.ts` makes before a flush — and the existing summaries stand. Only one prompt is in flight at a time, and a cursor advances only after a reply lands, so a prompt that failed is retried on the next flush rather than being believed already fed.

**The prompt is framed as data, not instruction.** Fed content is wrapped in a per-session delimiter, and the persona is primed at spawn to treat everything between the markers as data from a monitored tab, never as instructions — the same indirect-prompt-injection defence every monitor target gets, applied uniformly here because a transcript tail carries verbatim file contents and tool output.

**The summary map rides the launcher's own payload.** The republished tab carries `summaries`, a record keyed by tab label, through the `updateTab` capability — the path `tab-plugins.md`'s "Changing what a tab shows" already defines. The tab keeps its place, group, and focus, and no title is sent. Every client rebuilds the map from the record on any republish, so the rows keep their ordering even when a key disappears.

**The summarizer runs through the launcher tab's own core ACP connection.** It uses the published `startAcp`/`promptAcp` capabilities, not a subprocess of its own — which is the only route available, because `eslint.plugin-boundaries.mjs` blocks a server plugin importing `connectAcp` or `src/acp/launch.js` at all. That constraint is recorded here the way the other two corrections are, because it changed the design. The session is tool-less by construction: `connectAcp` denies every permission request a caller has not opted into, and the launcher opts into none.

Two consequences follow, and both were learned the hard way. First, the flush is an **intent** rather than a timer of the plugin's own: `pluginIntent(tab, …)` binds the answering label to the tab it names, so the ACP capabilities addressed from an intent handler resolve to *this plugin's own tab* — the one connection a summary can run on. Addressed from a `command` handler instead, the same capabilities answer with the tab the command was typed into, which is not this plugin's tab, and every prompt is refused. The client owns the cadence for the same reason, and an interval that stops when nothing is connected costs nothing. Second, the persona's first line — a harness directive naming a subprocess this session never spawns — is deliberately not sent: the model is the launcher tab's own. So a project without that harness gets no summarizer, rather than the monitor's spawn failure, and the persona file's body is all that is primed.

**The summarizer never reads the launcher's own tab.** Its prompts and replies land in that tab's transcript, so leaving it in the fed set would make every flush find content the summarizer itself just wrote — a prompt that can never go quiet, whose tail carries its own previous replies, and whose cost claim about idle applications would be false. It is matched on the plugin record rather than on the dock side, so the rule holds even if the launcher is undocked.

**A tab's cursor is advanced by inequality, not by growth.** The agent-name pool recycles a label the moment its tab closes, so a new tab can inherit a label whose cursor still records the dead tab's transcript length. Comparing by inequality — and dropping cursors for labels nothing shows — is what stops both a starved new tab and an unbounded cursor map. A paragraph is likewise rebuilt from the tabs live *now* rather than merged into a map that only grows, so a closed tab's text disappears with its row.

**The transcript tail is delimited, the way a monitor's target is.** Each flush wraps a tab's tail in a per-session unguessable marker and primes the persona to treat everything between the markers as data, never as instructions — the same framing `src/monitor/framing.ts` applies, copied because a plugin cannot import it. The label and the flags stay outside the markers, so the model still knows which tab it is describing.

**The Configure button dispatches, it does not open.** It issues the application's own `edit <path>` line for whichever file is in effect, from the launcher tab, which lands in the launcher's command bar and answer — the same `dispatchLineWithOutput` route the command rows use, and one that reaches a path outside the project root because the application's own `edit` has no such boundary.

## Tests

- Server: the `launcher` command opens the singleton tab docked left, refocuses on a second invocation, docks right on `launcher right`, and refuses any other argument with the usage line the other list plugins use.
- Server: `launcher.json` decoding — the home override replacing the project file, an absent file falling back to the default set, invalid JSON producing one notifications-feed line and leaving the file untouched, an unknown icon falling back to the neutral glyph, an empty array producing the default set, and a mixed array keeping its usable entries and reporting how many were lost. A duplicate id leaves one row to click, because `run-command` resolves an id back to the first entry holding it.
- Server: the `tabActivity` capability — it returns the host's open tabs with label, view kind, busy, unread, needs-input, last activity, and a transcript tail; it is refused as an unknown capability by a plugin whose declaration does not name it; and it adds nothing to the wire, so `TAB_PLUGIN_API_VERSION` stays 2.
- Server: the `tabs` topic — a republish is emitted when the rows move and skipped when they do not, so two transcript appends inside one minute cost no second broadcast; the `focus` action is refused for a label with no open tab and is narrower than the `dispatchLineWithOutput` grant the launcher already holds.
- Server: last activity is stamped on the tab runtime whenever content arrives, and gate state is stamped from each capture — so a tab's needs-input reading does not depend on a frame still being in memory.
- Server: last activity is a runtime stamp written wherever the transcript grows, minute-rounded in the payload so it cannot force a republish per append, and the summarizer's own cursor advances by inequality rather than by growth so a recycled label is neither starved nor left to grow the cursor map.
- Server: the summarizer — one priming and one prompt per flush, no prompt at all when no tab has moved, a refused start reported rather than thrown, a cursor advanced only after a reply lands, the launcher's own tab never fed, and a closed tab's paragraph dropped with its row.
- Server: the prompt delimits each tab's transcript tail in a per-session marker and primes the persona to treat what is between the markers as data, never as instructions.
- Server: an icon `launcher.json` names that this build cannot draw is reported once to the notifications feed and drawn with a neutral fallback, leaving its command runnable.
- Server: `janus init` writes `.janissary/launcher.json` from the launcher's own default list rather than a second copy, and never overwrites one that exists.
- Client: the five-tier sort with each tier's internal order preserved and a tier nothing is in not drawn; the row chrome (dot color, busy, unread flag, relative timestamp); a command row dispatching its exact line; a center-tab row sending `setActiveTab`; the absent-summary case rendering no summary line; keyboard navigation moving the selection and Enter activating, through the shared `nextListSelection` helper; the docked case omitting docked tabs; a needs-input tab sorting first; the timestamp coarsening as it ages; and the hover card opening on pointer-over with the tab's label, cwd, host, and last command line, drawn fixed against the viewport so the list's scroll container cannot clip it.

## Out of scope

Declined during gap research against Paseo, Conductor, Raycast, and VS Code, and deliberately deferred so no later phase re-proposes them:

- **Type-to-filter, fuzzy matching, and ⌘1–⌘9 digit jumps in the rail.** Paseo's Command Center and the app's own tab navigator both have these; the rail ships arrows plus Enter only. Declined for now — worth its own pass over the shared list-selection helper rather than a second implementation here.- **Pinned rows, collapsible tiers with counts, and row context menus.** Pinned rows above the tiers, a per-tier count when collapsed, and a menu offering rename / close / mark read. Declined because the menu pulls close and rename into the launcher, which this version deliberately keeps a navigator rather than an editor.
- **User-created and reorderable sections.** Conductor's user-named, emoji-tagged, runtime-editable section headers. Declined as a bigger follow-on over the tier set.
- **A versioned, schema'd, per-entry-merged `launcher.json`.** Conductor's `settings.toml` shape: five precedence tiers matched per entry by id, a per-entry `hide`, and entry-scoped *merging*. Declined as a format revision of its own, so the bare array ships first and the surprise of wholesale home-over-project replacement is a known, recorded consequence rather than a bug. What ships in the meantime is per-entry *dropping*: each row in a valid array is judged on its own, the unusable ones are dropped with one line saying how many, and the rest of the rail survives. The deferred format does not replace that policy, it replaces the file's shape.
- **Rail rows contributed by plugins.** Paseo extends its rail through `addSidebarHeaderItem` and lets one item render a runtime-changing list of rows; Raycast's rail is the extension registry. Declined — a plugin-API expansion that deserves its own plan rather than a rider on this feature.
- **A previous/next recency cycle.** Paseo and Conductor both ship one, ordered by last activity. Dropped during scope review on the decision that the timestamp on each row answers the question without adding a second navigation route; recorded here so a later phase can add it without re-researching why it was left out.

And the feature's own boundaries:

- Any change to the sidebar mechanism: resizing, the strip, the dock control, the docking rules, or the docked-tab-never-active invariant.
- Renaming, closing, or reordering tabs from the launcher. It navigates; it does not edit. (Launching features is what the command half is for.)
- A launcher-configured command list that reaches anything other than the application's existing commands — no new commands are invented here.
- Reordering the command rail by dragging, and a `hide` flag per entry.
- Any change to the monitor command, its personas, or its reporting tabs. The summarizer borrows their shapes, not their code, and the plugin boundary forbids it from reaching them.

## Verification

- `./scripts/run.mjs check-diff` after each change.
- Manual: run `launcher`, confirm the tab docks into the left sidebar and shows the command rail and the tab list. Click each command and confirm the feature opens where it says it will. Produce unread content on a background tab and confirm its row moves to the second tier with a flag, below any needs-input tab. Block a harness on a permission prompt and confirm its row leads the list. Confirm a busy background tab sorts above an idle one. Click rows and confirm each focuses. Confirm a summary paragraph appears per row, updates on the 30-second flush, and clamps to three lines with a hover expansion. Confirm the relative timestamp appears per row and coarsens as it ages. Confirm hovering a row shows the label, cwd, host, and last command line. Confirm a docked tab never appears in the list. Run `janus init` on a project without `.janissary/launcher.json` and confirm the file appears with the default set. Confirm `plugins` still reports `api=2` for every plugin.
