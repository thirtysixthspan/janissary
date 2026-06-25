# Tabs

Multiple workspace tabs, each with independent state. The `janus` tab is open at startup; additional agent tabs are created on demand.

### Default tab

A single `janus` tab is open on launch with dot color `#5b9cff`. No other tabs exist until explicitly created. When `--relaunch` is used, the saved state may include additional tabs that are all restored.

### Agent tab creation

Running `agent` creates a new tab with a random unused name chosen from a 52-name pool. The name is always lowercased. The new tab is created in the background — focus stays on the current tab, where an `Agent "<name>" ready.` confirmation is shown. The new tab joins the group of the tab it was created from (see Tab grouping). On `--relaunch`, agent tabs are restored from saved state rather than created manually.

### Named agent tab

`agent <name>` creates a tab with the given name (always lowercased). Focus stays on the current tab; switch to the new agent with the arrow keys or `next`.


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
- **Contiguity.** A new tab is inserted directly after the last tab of its group (`insertTabInGroup` in `src/tab.ts`) so each group stays a single connected run in the strip. Reordering (`Ctrl+←` / `Ctrl+→`) may only swap a tab with a neighbor **in the same group** (`canMoveTab`), so groups always stay contiguous and a tab can never be dragged out of its group.
- **Persistence.** `group` and `groupColor` are saved in each agent's state file and restored on `--relaunch`, so groupings reappear exactly as they were left.

### Active tab highlight

The active tab shows full-intensity foreground text on the content background color; inactive tabs show muted text on the bar background.

### Busy indicator

While a tab's agent is busy — running a shell command, an ACP turn, or any other in-flight work (the `busy` flag on the tab) — its colored dot **blinks**, toggling fully on and off (600ms each), so an at-a-glance scan of the strip shows which agents are working even when their tabs are not focused. The blink applies to every tab regardless of focus; when the work finishes the dot returns to a steady fill in the tab's dot color.

### Tab switching with arrow keys

Shift+Left and Shift+Right arrow keys cycle through open tabs. No-op when only one tab exists. (Unmodified Left/Right move the input cursor; Ctrl+Left/Right reorder the current tab within its group — see Tab grouping.)

### `next` command

The `next` command programmatically switches to the next tab.

### Per-tab state isolation

Each tab carries its own transcript log, command history (including navigation index), and scroll offset. Switching tabs preserves each tab's state.

### `close` command

Closes the current tab and all of its associated connections — its shell, ACP session, browser, harness/interactive terminals, and scheduled timers — removes any workspace clone and its in-memory agent state, and selects an adjacent tab. `close` is reserved for closing tabs (not exiting the app). Closing the last remaining tab opens a fresh `janus` tab, exactly as on launch. (Open SQLite connections are global, not tab-scoped, so they are left open — close them with `connection close sqlite:<name>`.)
