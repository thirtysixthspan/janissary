# Sidebar launcher tab

**Complexity: 7/10** — a first-of-its-kind docked list plugin with a config file read at two paths, plus a new host capability and an ACP session owning cross-tab reads, where the correctness work is in the sort tiers and the summarizer's flush/lifecycle rules rather than in the amount of code.

## Goal

A singleton `launcher` tab provides a command rail and a live list of center tabs in the sidebar. Commands use the application's existing command dispatch; tab rows focus their target. Rows are grouped by attention state and may show a short ACP-written status summary.

The launcher opens docked left by default; `launcher right` docks it on the right. A bare invocation focuses the existing singleton. The dock mechanism remains shared with other dockable tabs, so docking a different tab into the same sidebar uses the existing sidebar tab switcher.

## Design decisions

**The launcher is a tab plugin.** Its server and client entries follow the bundled plugin contract. It claims no file extensions, uses the shared dock-argument parser, and has one stable instance key. Its published shared contract is import-free and does not change the tab-plugin API version.

**The command rail dispatches application commands.** A command row requires a first click to select it and a second click to run it, matching the command rail's confirmation behavior. It dispatches the configured command line through the launcher tab's command-bar host path. Application-owned picker commands are handled client-side; server-dispatched commands show their result or error in the launcher's response surface. There is no shell fallback. Configure dispatches `edit <path>` for the active configuration file.

**Configuration is a replaceable array.** The home file `~/.janissary/launcher.json`, when present, replaces the project file `.janissary/launcher.json`. `janus init` writes the project default only when absent. Each invocation rereads the effective file. Empty, missing, unreadable, invalid, or wholly malformed configuration falls back to built-in commands as specified; a partially valid array keeps usable rows and reports dropped rows. Duplicate IDs are rejected, generated IDs avoid explicit IDs, and an unsupported icon uses a neutral display fallback without disabling its command. Changes to configuration republish the rail even when no tab row changed.

**Rows describe only focusable center tabs.** Docked tabs and the launcher's own tab are omitted. The own-tab check uses both plugin ID and instance key, so another plugin's matching key is not excluded. Rows preserve host strip order within five tiers: needs you, unread, active, working, and idle. Needs-you state comes from the host's `gateNeedsUser` fact, excluding gates the application is handling and scheduled resumes. The flattened displayed order is also the keyboard navigation order. An inactive tab row focuses on its first click; a click for a tab that has already closed is harmless.

**The host publishes bounded facts.** `tabActivity` returns display metadata, runtime activity time, transcript revision and incarnation, and a separately requested bounded transcript tail for summarization. The ordinary launcher rows contain no transcript content. Tail limits are finite, floored positive integers; invalid or sub-one limits return no entries. Transcript revision advances on appends, in-place running-entry updates, and transcript clears. Activity time is maintained by the tab runtime and rounded for display publication so ordinary output does not force per-write broadcasts.

**The summarizer uses the launcher's ACP session without tools.** It reads the project persona when available and otherwise the shipped fallback; only the persona body is primed because its harness directive is not used. `startAcp({ withoutTools: true })` marks the launcher tab's runtime as tool-less, and the manager supplies an empty host-tool table. The policy persists across session replacement and applies to typed ACP prompts on that tab until it closes.

## What already exists (reuse, don't rebuild)

- Docking, the one-tab-per-kind-per-side rule, sidebar tab switching, tab focus, and unread dwell remain host behavior.
- The plugin API provides declared capabilities, `tabActivity`, `originTab`, `updateTab`, `dockTab`, `topicAction`, `dispatchLineWithOutput`, notifications, and ACP operations. The launcher declares only the capabilities it uses.
- Existing command-bar hosting and dispatch carry command output and errors; client-owned picker words continue through their existing handlers.
- Shared list selection, tab-row status chrome, relative-age formatting, and the host ACP response surface are reused.
- `janus init` and the plugin manifest supply the command and configuration defaults; no second default list is maintained.

## Proposed changes

The launcher publishes command rows and tab activity through its plugin topic. Its configuration reader validates each row, resolves stable command IDs, applies the home-over-project precedence, and returns a usable default when configuration cannot be used. The server resolves a click against the latest published command ID rather than trusting a client-supplied command line.

Tab activity includes label, view, title, busy/unread/needs-user state, last activity, cwd, remote host, last command, incarnation, transcript revision, and a bounded transcript tail. The display payload omits the tail. It filters docked and own-launcher tabs, republishes only changed tab/configuration data, and reports invalid configuration and unknown icons through notifications.

The client draws the bounded command rail above a scrollable tab list. Rows use the tab's status dot and unread state, a minute-updated relative age while visible, and a hover card with title, label when different, cwd, remote host, and last command. The list preserves displayed tier order for mouse and keyboard selection. Tab rows focus on one click; command rows retain two-click confirmation. The first row is focused when the list becomes active. A composed list ref supports both keyboard scrolling and external focus requests.

### How the summarizer works

The client requests a flush every thirty seconds while connected. One prompt includes only changed, non-docked center tabs other than the launcher's own tab. Each entry includes the tab's label, view, status facts, age, last command, and a separately fetched size-capped transcript tail. A tab is changed when its transcript incarnation, revision, or length differs from the saved cursor.

Each tab's supplied strings are wrapped in a unique per-session delimiter and described as data in the persona prompt. The reply uses a marker keyed by tab label. Unknown or malformed labels are discarded. Reply handling rechecks incarnation before accepting a summary or advancing its cursor, preventing a closed tab's late reply from affecting a new tab that reuses its label. Cursors and summaries for closed tabs are pruned. Tabs omitted from a partial reply retain their prior summary; refused or failed prompts do not advance cursors and are retried. A replaced ACP session is primed again with a new delimiter. Summaries are displayed only when available, clamped to three lines and expanded on hover.

The flush is an intent tied to the launcher tab, so its ACP capabilities use that tab's own connection. It starts the session without tools, and its turns appear in the host ACP response surface above the command bar. Closing the launcher clears its summaries and cursors.

## Tests

- Server tests cover singleton command parsing and docking; configuration precedence, defaults, malformed and partially valid rows, ID collisions, unknown icons, and rereading; safe command resolution and error reporting; and republishing when rows or configuration change.
- Plugin contract tests cover declared capability access, import-free shared types, stable launcher identity, and unchanged API version.
- Activity tests cover omission of docked and own-launcher tabs, needs-user facts, transcript-tail limits, revision changes on append/update/clear, runtime activity stamps, and incarnation identity.
- Summarizer tests cover changed-tab selection, no-op flushes, one in-flight prompt, framing, persona fallback, no-tools startup and persistence, session replacement, refused prompts, cursor advancement, partial replies, label reuse, and cleanup of closed tabs.
- Client tests cover tier order, within-tier order, status and age display, hover details, keyboard selection and focus, first-click tab focus, two-click command confirmation, picker handling, error/unclaimed output, summary rendering, and responsive list/rail layout.
- Initialization tests cover writing defaults without overwriting an existing launcher configuration.

## Out of scope

- Changes to sidebar mechanics, docking rules, the tab strip, or the invariant that docked tabs cannot be active.
- Editing tabs from the launcher: rename, close, reorder, pin, context menus, and user-defined sections.
- Type-to-filter, fuzzy matching, digit shortcuts, recency cycling, and drag-reordering commands.
- Plugin-contributed rail rows or a versioned, per-entry-merged configuration format.
- New command execution mechanisms, shell fallback, changes to the monitor command, or changes to other personas.

## Verification

The implementation is covered by the focused server, plugin, initialization, and client tests listed above. After the rebase, `check-diff` and the full `pr-check-gate` passed. Manual behavior to check includes left/right singleton docking, shared sidebar occupancy, command confirmation and dispatch, focus and sorting across all five tiers, needs-user handling, live configuration reload, relative ages and hover details, and summaries updating only for changed center tabs while respecting tool-less ACP behavior.

During the rebase, master added the diff plugin and moved the shared JSON compatibility guard into `json-compatible.ts`; the catalog retains the diff, markdown, and launcher manifests, and the diff test imports the guard from its defining module.
