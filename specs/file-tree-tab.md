# File Tree Tab

A **file tree tab** shows a directory tree, opened with `files [path]`. It is a non-agent **view
tab**: a keyboard-navigable tree of files and directories shown in place of the usual transcript
and command bar, controlled by direct interaction (clicking, arrow keys) rather than a command
line. It behaves like a markdown tab (see Markdown Tab) — same lifecycle and tab-strip
treatment — differing only in what fills the body and how that body is navigated.

A file tree tab is created like an agent tab (see Tabs) — placed contiguously within the active
tab's group, inheriting that group's number and bar color and taking a distinct dot color. Focus
moves to the new file tree tab.

Unlike an agent tab, a file tree tab has no shell, agent session, browser, transcript, or command
history, and no persisted agent state. It is a **live, in-memory view** — like markdown and image
tabs, it is not saved and is not restored on `--relaunch`.

### `files [path]`

`files` opens a tree rooted at the issuing tab's cwd; `files <path>` opens it rooted at `path`
instead (resolved against the issuing tab's cwd if relative). If the resolved target does not
exist or is not a directory, an error (`files: <path>: not a directory`) is appended to the
issuing tab's transcript and no tab is created.

If a file tree tab is already open on the same root, `files` **focuses that tab** instead of
opening a duplicate — there is one tree per root, the same way there is one Explorer per
workspace in a conventional editor.

### `files left`/`files right [path]`

A leading `left` or `right` keyword docks the tree into that sidebar instead of the central tab
strip — see `sidebars.md` for sidebar mechanics. The keyword is only recognized as the tree's
first word, so a directory literally named `left` or `right` is still reachable through a path
form (`files ./left`).

- **Bare `files [path]`** behaves exactly as above. If a tree on that root already exists and is
  currently docked, focusing it means **undocking it back to the center strip and making it
  active** — focusing a tree must make it visible somewhere the user is looking.
- **`files left [path]` / `files right [path]`**: if a tree on that root already exists (docked
  anywhere, or sitting in the strip), it **moves** to the requested sidebar. Otherwise a new tree
  is created exactly as `files [path]` would, then immediately docked. Either way, if the target
  sidebar already holds a different tree, that tree is **displaced back to the center strip**
  (non-destructive — nothing is closed as a side effect of docking).

### Tree contents

The tree shows, for the root and every directory the user has expanded:

- **Directories before files**, each group sorted alphabetically, case-insensitive.
- **Default excludes**: `.git`, `.svn`, `.hg`, `.DS_Store`, `Thumbs.db` (VS Code's `files.exclude`
  defaults) are never shown. Every other dotfile (`.env`, `.gitignore`, …) is shown.
- **Symlinks** (to a file or a directory) render as a leaf file — never expandable.

A directory's children are read from disk only once it is **expanded** — an unopened directory
(e.g. `node_modules`) costs nothing until the user opens it.

### Watching

Every currently visible directory (the root, plus every expanded directory) is watched for
changes. When a watched directory's contents change — a file or directory appears, disappears, or
is renamed — the tree updates within about a second (changes are debounced so a burst of
filesystem activity, like a `git checkout`, coalesces into a single refresh). If an expanded
directory is deleted, it collapses automatically and its watcher stops; a tree with a broken
watcher (permission denied, exotic filesystem, file-descriptor limits) keeps working — it simply
stops refreshing automatically and can be refreshed manually by collapsing and re-expanding.

### Mouse interactions

| Interaction | Behavior |
|---|---|---|
| Click a directory row (anywhere on the row) | Select it and give the tree keyboard focus |
| Click a file row | Select it and give the tree keyboard focus |
| Double-click a file row | Select it and open it (with `open`) |
| Double-click a directory row | Select it and toggle expand/collapse |
| Double-click the `..` row | Navigate the tree up one directory |
| Shift+double-click a file row | Select it and open it in the plain-text editor (with `edit`), even for files whose normal opener is a viewer (Markdown, images) |
| Chevron (▸/▾) | Visual affordance only — the whole row is the click target |
| Header collapse-all button | Collapse every expanded directory back to just the root |
| Scroll wheel / trackpad | Scrolls the row list |

Opening or editing a file from the tree uses the same `open`/`edit` commands available at any
command line, dispatched with the tree tab's cwd set to its root — so a row's path (relative to
the root) resolves correctly. The opened file's tab lands in the same group as the tree tab.

### Keyboard interactions

A focused file tree tab captures its own keys, following the ARIA treeview pattern (see
`keyboard-navigation.md`):

| Key | Behavior |
|---|---|
| `↑` / `↓` | Move selection to the previous / next visible row |
| `→` | Collapsed directory: expand (selection stays). Expanded directory: move to its first child. File: no-op |
| `←` | Expanded directory: collapse. Otherwise: move selection to the parent directory |
| `Enter` / `Space` | File: open. Directory: toggle expand/collapse. `..`: navigate to parent directory |
| `Shift+Enter` | File: open in the plain-text editor (mirrors Shift+double-click) |
| `Home` / `End` | Select the first / last visible row |
| `Page Up` / `Page Down` | Move selection by one viewport of rows |
| Printable characters | Type-ahead: jump to the next visible row whose name starts with what's typed; the typed buffer resets after a pause |

Chords carrying Ctrl or Cmd (tab switching, tab reordering, closing the tab, etc.) are not
captured by the tree and reach the normal window-level bindings instead.

If the selected row disappears (the directory watcher removed it), selection moves to the nearest
surviving row rather than pointing at nothing.

### Tab strip: name and close button

In the tab strip a file tree tab reads exactly like an ordinary tab — same dot, group bar, active
highlight, and ordering — with three differences:

- **Placement.** A file tree tab is placed at the beginning of its tab group (other tab types land
  at the end), so the tree sits left of the content it navigates.

- **Name.** The tab label is always `navigator` (for the first tree tab; subsequent ones are (the tree's root path is shown in the tab's own
  header using the standard metadata display, not in the strip). The path is abbreviated using the
  `$root` and `~` shortcuts. Per
  [[tab-label-no-markers]], no type or status marker is appended.
- **Close button.** A close control is shown right-aligned within the tab, identical to other
  view tabs (markdown, image, editor).

While a file tree tab is **docked** into a sidebar (see `sidebars.md`), it leaves the tab strip
entirely — there is no duplicate representation of a docked tree in the strip.

### Header buttons

Every file tree tab's own header carries a **location button** that cycles the tree through
left sidebar → center tab strip → right sidebar → left sidebar, one step per click, with a
tooltip naming the destination. While docked, the header also shows a **close button** (×) — a
docked tree has no strip × of its own and, being never the active tab, cannot be closed by typing
`close` either, so this is its only direct close affordance (`close files` by label still works
as a fallback).

### Closing

Closing a file tree tab (via its close button, the `close` command, or app shutdown) stops every
watcher it opened. Because a file tree tab owns no shell, agent session, browser, or workspace,
the rest of ordinary tab teardown simply does nothing for it. Closing the last remaining tab quits
the app, exactly as the `close` command does elsewhere (see `tabs.md`).

### Reordering and grouping

A file tree tab is an ordinary member of the tab strip: it belongs to a group, stays contiguous
within it (see Tabs → Tab grouping), and can be reordered within its group like any other tab.
This applies while it sits in the strip; a docked tree keeps its group membership latent and
returns to its position on undock.
