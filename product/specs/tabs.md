# Tabs

Multiple workspace tabs, each with independent state. The `janus` tab is open at startup; additional agent tabs are created on demand.

### Default tab

A single `janus` tab is open on launch with dot color `#5b9cff`. No other tabs exist until explicitly created. When `--relaunch` is used, the saved state may include additional tabs that are all restored.

### Agent tab creation

Running `agent` creates a new tab with a random unused name chosen from a 52-name pool. The name is always lowercased. The new tab is focused immediately, showing its transcript. The new tab joins the group of the tab it was created from (see Tab grouping). On `--relaunch`, agent tabs are restored from saved state rather than created manually.

### Named agent tab

`agent <name>` creates a tab with the given name (always lowercased). The new tab is focused immediately.


### Duplicate name rejection

Creating a tab with a name already in use prints `Agent "<name>" is already active.` and does not create a duplicate tab.

### Name exhaustion

When all 52 pool names are used, bare `agent` prints `All agent names are in use.` and creates no tab.

### Tab dot colors

Each tab has a colored dot drawn from a 15-color palette, cycling as tabs are added. The default `janus` tab uses the first palette color. A new tab's dot color is chosen to be perceptually distinct from the colors already on screen (`distinctColor` in `src/tab.ts`), rather than strictly cycling, so adjacent tabs stay easy to tell apart.

### Tab grouping

Every tab belongs to a **group**, identified by a `group` number and a fixed `groupColor` (the group's bar color). A group renders as a colored top border spanning each member tab's full width, drawn at full strength on every tab in the group — active or inactive, never faded — so related tabs read as a connected band in the strip.

- **Root group.** The startup `janus` tab is group 1, and its group color is its own dot color.
- **Inheritance.** An agent created with `agent` / `agent <name>` joins the group of the tab it was created from (the active tab), inheriting that group's number and bar color. Because creation is transitive, a chain of agents spawned from one another all share a single group.
- **Profiles form a group.** Launching a profile creates one new group (the next free group number) shared by all of that profile's agents; the group's bar color is fixed to the first launched agent's color. See Profiles.
- **Fixed color.** A group's bar color is set when the group is first created (the color of its first member) and stored per tab, so it never shifts when tabs are reordered or a member is closed.
- **Contiguity.** A new tab is inserted directly after the last tab of its group (`insertTabInGroup` in `src/tab.ts`) so each group stays a single connected run in the strip. Reordering (`Ctrl+←` / `Ctrl+→`) may only swap a tab with a neighbor **in the same group** (`canMoveTab`), so groups always stay contiguous and a tab can never be dragged out of its group. A tab can be temporarily absent from the strip while docked into a sidebar; see `sidebars.md`.
- **Persistence.** `group` and `groupColor` are saved in each agent's state file and restored on `--relaunch`, so groupings reappear exactly as they were left.

### Window focus dimming

While the janus window itself lacks OS-level focus — the user has switched to another application, or (in a browser) another browser tab — every tab's colored group-color border dims slightly, uniformly across the whole strip. It returns to full strength as soon as the window regains focus. This is independent of, and does not affect, which in-app tab is active or the group-color border's full-strength/never-faded rule described under Tab grouping.

### Active tab highlight

The active tab shows full-intensity foreground text on the content background color; inactive tabs show muted text on the bar background. These foreground/background colors — like all other state indicator colors in the strip and transcript — come from the active application theme (see `application-themes.md`); tab dot colors and group bar colors do not, staying per-tab in every theme.

### Busy indicator

While a tab's agent is busy — running a shell command, an ACP turn, or any other in-flight work (the `busy` flag on the tab) — its colored dot **blinks**, toggling fully on and off (600ms each), so an at-a-glance scan of the strip shows which agents are working even when their tabs are not focused. The blink applies to every tab regardless of focus; when the work finishes the dot returns to a steady fill in the tab's dot color.

### Unread badge

When an **inactive** tab receives new transcript content — a message from another agent (`msg`/`broadcast`), ACP/agent output, a shell command finishing, or a browser/connection command completing — an **unread badge** (a flag icon) appears on that tab in the tab strip, rendered as a sibling of the tab name so it does not inherit the busy-dot blink. The badge stays until the tab is focused, then clears. The active tab never shows the badge.

**Marking.** Content delivery marks a tab unread via a single `TabManager.markUnread(label)` helper, which sets `hasUnread` only when the target tab is not the active tab and not docked into a sidebar. The helper is called from `append` (messages, command output, ACP output), `finishRunning` (browser/connection completion), and the shell manager's `onDone` callback (shell command completion). In-progress shell output (`onChunk`) does not mark — the busy dot already conveys that state; the badge signals completed new output.

**Docked tabs never badge.** A tab docked into a sidebar (see `sidebars.md`) is permanently visible chrome and can never become the active tab, so it is never eligible for the unread badge either — new content delivered to a docked tab (for example the notifications tab) never sets `hasUnread`.

**Clearing.** Focusing a tab always clears its badge, regardless of the activation path: click, `next`, Shift+←/→, or any other route through `setActiveTab`. Paths that set `activeTab` directly (`reorderTab`, `closeTab`) clear the badge explicitly as well, so the invariant "the focused tab never shows the sparkle" holds without exception.

**Persistence.** `hasUnread` is in-memory only — not persisted to agent state — so tabs rehydrate with no badge on `--relaunch` (same policy as `scrollOffset` and `toolStepsExpanded`).

### Tab switching with arrow keys

Shift+Left and Shift+Right arrow keys cycle through open tabs. No-op when only one tab exists. (Unmodified Left/Right move the input cursor; Ctrl+Left/Right reorder the current tab within its group — see Tab grouping.)

### `next` command

The `next` command programmatically switches to the next tab.

### Keyboard focus on tab press

Pressing a tab's label immediately moves keyboard input focus to that tab's command bar, on mouse-down (before the click is released), so it fires reliably even when the app window itself was unfocused and is being brought forward by the same press. If the pressed tab is a harness or shell PTY tab, focus subsequently moves to that tab's terminal instead, once the tab becomes active.

Releasing the mouse (mouse-up) anywhere in the body of an agent tab also moves focus to that tab's command bar — unless the mouse gesture produced a text selection in the transcript (a click-and-drag), in which case focus is left alone so the selection survives; the selected text is instead copied to the clipboard (see History → Click to execute).

### Metadata row

Agent tabs, harness tabs, and shell (PTY-takeover) tabs each show a small metadata row above their
body: the tab's current working directory (abbreviated the same way as other tab header locations),
followed by an icon for each of the tab's currently-active flags. A flag with no active state
contributes no icon — there is no "disabled" indicator — and the row always renders, showing at
least the working directory, even when a tab has zero active flags.

Text content in metadata rows and headers throughout the application is selectable with the mouse,
including paths, names, sizes, branches, addresses, monitor details, and agent settings. Native
selection is preserved so the selected text can be copied.

The tab strip's own labels are not selectable with the mouse — clicking and dragging across a
tab's name behaves like clicking any other UI control rather than highlighting text.

Today there are two possible flags: **workspaced** (a box icon), shown when the tab has its own isolated
git clone, and **auto-permitting** (a bolt icon), shown when harness auto-approval is enabled (harness tabs
only — see Auto-approve permissions in `harness.md`). Hovering a flag's icon shows a tooltip naming
it ("Workspaced", "Auto-permitting"). More flags of the same kind are expected in the future.

Agent tabs and harness tabs also show a right-aligned file-navigator button (a folder icon, tooltip "Open file
navigator here") at the end of the metadata row. Clicking it opens a file navigator rooted at that
tab's own working directory; shell (PTY-takeover) tabs do not show this button. See "Opening from a
tab's metadata row" in `file-tree-tab.md` for how it opens or retargets the navigator.

Beside the file-navigator button, agent tabs and harness tabs also show a launch-agent button (a plus icon,
tooltip "New agent here"). Clicking it immediately creates a new, auto-named agent tab whose working
directory is that tab's own working directory — the one-click equivalent of the `agent` command,
except the new agent starts where this tab is rather than in the server's own directory. The new tab
joins the source tab's group and is focused right away; there is no dialog or name prompt. The button
appears only when the tab has a known working directory, and shell (PTY-takeover) tabs do not show it.
If a new agent cannot be created because all pool names are already in use, the "All agent names are
in use." message is posted to the notifications feed (when that feed is open) rather than to the
source tab, so the click still gives visible feedback even from a harness tab that has no transcript.

Agent tabs (not harness tabs) also show a clipboard-icon button, tooltip "Open transcript". Clicking
it writes the tab's full transcript — every entry's input and output — to a plain-text file and opens
it in an editor tab, mirroring the existing screen-capture and monitor-context-snapshot affordances
elsewhere in the app. The button is a no-op when the tab's transcript is empty.

### Per-tab state isolation

Each tab carries its own transcript log, command history (including navigation index), and scroll offset. Switching tabs preserves each tab's state.

### Tab label length

A tab name longer than its display limit is shortened with a trailing `…`. Inactive tabs use `tabNameMaxLength`, which defaults to 16 characters. The active tab uses `activeTabNameMaxLength`, which defaults to 50 characters, so focusing a tab reveals more of a long name. Each limit counts the ellipsis as one of its displayed characters.

File-backed tabs keep the complete filename in their tab state and apply these limits only while rendering the strip. Focusing a file-backed tab can therefore expand a name that was shortened while inactive without losing any part of the underlying filename.

### Tab display alias

Any tab can be given a **display alias**: a name shown in the tab strip in place of its internal label, without changing the label itself. The label remains the identifier used everywhere else — `msg`/`broadcast` routing, the monitor feed, and every other tab-targeting feature keep working against the original name; only the strip's appearance changes. The plain-text editor tab is the one exception: it has no alias concept, since it represents a file on disk — renaming its label always renames the underlying file (see `editor-tab.md`).

An alias can be set two ways:

- **`rename <newname>`**, typed into a tab, sets that tab's alias and prints a confirmation reminding you that routing still uses the original name. Bare `rename` (no argument) clears the alias, reverting the strip to the label.
- **Double-clicking the label of the already-active tab** turns it into an editable text field. For a tab backed by a file (editor, markdown, or image), the field is pre-filled with the file's full name even when the strip's displayed name is shorter because it was cut down to fit; for any other tab, it is pre-filled with the current display name. Pressing Enter or clicking elsewhere commits the new value; pressing Escape cancels and leaves the alias unchanged. Single-clicking the label of an inactive tab still just selects it; single-clicking the label of the active tab also only selects it and does not begin editing. The click that focuses a previously-inactive tab is never treated as half of a double-click, so quickly clicking an inactive tab's label twice selects it without starting the rename editor — only a double-click on a tab that was already active begins editing.

Setting the alias to an empty value, or to the same text as the label, clears it rather than storing a redundant alias. Aliases are display-only — they need not be unique, and two tabs may show the same alias while remaining distinct by label.

While editing via double-click, the field accepts up to 50 characters — independent of the strip's display truncation length — so a full file name can always be typed in, including for an editor tab whose rename renames the file on disk. The field starts sized to its pre-filled content and widens only as further characters are typed, rather than reserving space for the maximum length up front.

An alias persists across `--relaunch`, restored alongside the rest of the tab's saved state.

### `close` command

Closes the current tab and all of its associated connections — its shell, ACP session, browser, harness/interactive terminals, and scheduled timers — removes any workspace clone and its in-memory agent state, and restores focus to whichever tab was focused immediately before the closed one became active. If that tab no longer exists (it was closed too, or is now docked into a sidebar) or was never recorded, focus falls back to the nearest adjacent tab. While more than one tab is open, `close` (or its alias `exit`) only closes tabs — exiting the app is `quit`, which asks for confirmation first (see `quit-confirmation.md`). **Closing the last remaining non-docked tab quits the app**: it behaves exactly like `quit`, whether the close came from the command, the tab strip's × button, the Cmd+W / Ctrl+W keyboard shortcut, or the tab's process exiting. Sidebar-docked tabs do not count toward this check — the app quits when the central tab strip has no tabs left, regardless of what is docked. When `close`/`exit` is *typed* on the last tab, the quit confirmation dialog is shown first, same as typing `quit`; the × button and a process exit quit directly. `close page <n>` (or `exit page <n>`) closes a numbered page tab instead of the active one. `close <name>` (or `exit <name>`) closes the tab whose label matches the given name; the match is case-insensitive. If no tab with that name exists, an error is reported. Typing `close <partial>` (or `exit <partial>`) tab-completes the name against every open tab's label. (Open SQLite connections are global, not tab-scoped, so they are left open — close them with `connection close sqlite:<name>` — except when the last non-docked tab closes, which closes all of them as part of app shutdown.)

### View tabs

Besides agent tabs, several **view tabs** render a non-transcript body in place of the command line: image (`open <image>`), embedded web page (`open <url>`), rendered markdown, the plain-text editor, the file tree navigator (see `file-tree-tab.md`), the monitor reporting feed (see `monitoring.md`), and the notifications feed (see `notifications.md`). View tabs are **live, in-memory** — none are persisted to agent state or restored on `--relaunch`.
