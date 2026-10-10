# Launcher

The launcher is a dockable tab that acts as the sidebar's home: a rail of launch commands above a list of every open tab, so a feature or a working tab can be reached without hunting through the center strip. It is modelled on the Paseo sidebar — a short stack of named actions over the open workspaces, grouped by what each is doing right now.

It is one tab kind among the sidebar's dockable kinds and shares the docking mechanism with them all: `launcher` opens or focuses its singleton tab docked into the left sidebar, `launcher right` puts it on the right, and a second bare `launcher` focuses what is already there. Docking a previous launcher displaces it back to the center strip rather than stacking a second one.

### The command rail

The rail lists application commands, one row each, with an icon and a label. Clicking a row runs the command it names, exactly as typing it would — so `notifications left` docks the notifications feed to the right, and a command's own answer lands in the launcher's transcript rather than in a second copy of its rules.

Which commands appear is configured in `.janissary/launcher.json`, written by `janus init` and edited by hand. It holds an array of entries, each with an `icon`, a `label`, and a `command`:

```json
[
  { "icon": "faTerminal", "label": "New shell", "command": "zsh" },
  { "icon": "faBell", "label": "Notifications", "command": "notifications left" }
]
```

The label is the user's own wording for the command, so two projects may call the same command different things. The icon is a Font Awesome icon name, drawn as a neutral fallback glyph when it is not one the build recognises — the command it belongs to still runs.

A `~/.janissary/launcher.json` in the user's home directory **replaces** the project file wholesale when it exists. An absent file, an unreadable one, one that is not valid JSON, and one whose entries are all malformed fall back to a built-in default command set; the launcher reports what was wrong to the notifications feed once, and leaves the file on disk untouched. A file with some good entries and some bad keeps the good ones and reports how many were lost. An empty array is treated as no configuration at all rather than as a choice to show nothing.

Every `launcher` invocation re-reads the file in effect, and the rail is republished from it whenever it has changed — so the labels and commands the rail shows are the ones a click will run, even when no tab row moved to make the change visible.

The rail's **Configure** button opens whichever file is currently in effect — the home override when one exists, otherwise the project's — in an editor tab, so what it opens is what the launcher reads back.

### The tab list

Below the rail is every open tab in the center strip, sorted into five tiers, each labelled. In order: **needs you**, **unread**, **active**, **working**, **idle**. Tabs keep their existing strip order inside a tier, so a row never moves within its tier. A tier no tab is in is not drawn at all.

A tab ranks **needs you** when it is holding something the user has to answer — a pending agent question, or a harness sitting at a permission prompt. It sits above every other tier, including unread and active, because it is the one state worth interrupting for; without the tier, a blocked tab reads as merely busy, which is the row chrome a working tab gets.

Docked tabs are never listed, and neither is the launcher's own tab. A docked tab is never the active tab and cannot be focused from here, so listing one would offer a click that cannot do what the list promises.

Clicking a row focuses that tab in the center strip, the same way clicking it in the strip does — which starts the ordinary unread dwell, so a row read for three seconds loses its flag exactly as the strip's own. Clicking a tab that closed between the click and its answer does nothing.

### What each row shows

Every row carries the same status chrome the tab strip gives it, plus its time: the tab's dot color (blinking while the tab is busy), its name, its unread flag, and how long ago it was last active — a relative age that coarsens from minutes to hours to days as it grows.

### The status summary

Each row also carries a short paragraph saying what that tab is doing, written by an ACP session the launcher owns. It is the same idea as a monitor persona's recap, applied to the whole application rather than to one target: one prompt every thirty seconds describing every open tab, one paragraph back per tab.

The summarizer runs on the launcher tab's own ACP connection rather than a subprocess of its own, and is tool-less: it may read, and it may not act. That is held by the host rather than asked of the model — the session is started without a tool table, so a reply naming a browser, question, or database command has nothing that runs it. It never summarizes the launcher's own tab, because that tab's transcript is where its own prompts and replies land — leaving it in would make every flush find content it had just written, and an application where nothing is happening would never be quiet.

The summarizer reads each tab's label, its view kind, whether it is busy or badged or waiting on the user, how long ago it was last active, its last command line, and a size-capped slice of its recent transcript. That slice is asked for on its own read of the host's tabs, separate from the display one, and it never travels the other way: the rows the launcher publishes carry no transcript content at all. Every string a tab supplies — its display name, its last command line, and that transcript slice — is framed as data rather than as instruction, wrapped in a marker unique to the session and primed as data the persona does not obey; outside the markers the prompt carries only the label the reply is keyed on and the flags the host measured. This is the same defence a monitor's target receives, because a transcript slice carries verbatim file contents and tool output. It is a boundary rather than a guarantee: a model can still be talked around, which is why the summarizer's session is also started without any tools at all, so a reply cannot invoke one.

Nothing is prompted when no tab's content has changed since the previous flush, so an application where nothing is happening costs nothing. What counts as a change is the tab's transcript having been written to, not its length having moved: output streamed into a running entry rewrites in place, and an append to a log already at its cap displaces the oldest entry, so neither of them changes the length and both are seen. A row whose summary has not arrived shows no summary line rather than a placeholder, and the launcher otherwise works normally. A prompt the core cannot answer is reported to the notifications feed rather than being believed an answer, and nothing is marked as fed: the next flush asks again. A session that has been replaced since the last flush is re-primed — the persona, the reply shape, and a freshly minted delimiter — because the successor arrives with none of it.

A tab keeps its paragraph until it closes or until a reply replaces it. A flush asks only about the tabs whose transcript has changed, so a reply normally names only those — and the tabs it did not ask about keep what they already had rather than showing nothing until the next prompt that happened to include them. A tab that closes loses its paragraph with its row, and its label is recycled the moment it goes, so nothing is kept under a name a new tab could inherit.

The paragraph is clamped to three lines of the row's width and expands to as many as eight while the pointer is over the row, so a long summary is never lost — only held back until it is wanted.

### Hovering a row

Hovering a tab row opens a small card carrying what the row has no width for: the tab's name, its label when they differ, its working directory, its remote host when it has one, and the last command it ran. It is drawn just below the row wherever the row sits, so the list's own scrolling never cuts it off. The card is hover-only — it appears on pointer-over and closes on pointer-out, and never on touch or keyboard focus alone.

The file executes what it names: a row's click runs its command as if it had been typed, so a project's committed `launcher.json` is a set of commands this application will run. `~/.janissary/launcher.json` replaces the project's file rather than merging with it.

### The command bar

The launcher hosts the application's own command bar beneath its lists, so a dispatched command's answer and any error is visible in the launcher itself, and a command can be typed straight into the rail. A line the application claims runs as that command; one nothing claims is reported as such, because the launcher has no shell to hand it to.
