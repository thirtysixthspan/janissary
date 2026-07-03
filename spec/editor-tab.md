# Editor Tab

An **editor tab** displays a plain-text file opened with the `edit` or `open` command, using the
editor opener (see Open). It is a non-agent **view tab**: the file's text is shown as an editable
buffer in place of the usual transcript and command bar, controlled by direct keyboard input and
mouse selection. It behaves like a markdown tab — same lifecycle and tab-strip treatment — differing
in the editable content and keyboard handling.

An editor tab is created like an agent tab (see Tabs) — placed contiguously within the active tab's
group, inheriting that group's number and bar color and taking a distinct dot color. Focus moves to
the new editor tab.

Unlike an agent tab, an editor tab has no shell, agent session, browser, transcript, or command
history, and no persisted agent state. It is a live, in-memory view — like markdown tabs and image
tabs, it is not saved and is not restored on `--relaunch`.

### Scrubbing

The editor buffer follows the same scrubbing rules as the terminal input (see CLI → Scrubbing):
keypresses that carry text are masked from the transcript log, while navigation keys (arrows, page
up/down, etc.) are not.

### Layout

- **Metadata header** — the file's name, size, and location.
- **Editor body** — fills the remaining space. Scrolls independently.

### New files

The `edit <file>` command can open a path that does not yet exist on disk. The editor opens with
an empty buffer showing the file's name, a size of "unknown", and the resolved path in the metadata
header. The file is not written to disk until the user explicitly saves (Ctrl+S / Cmd+S). On the
first save, the file is created at the given path and the size display updates to reflect the new
on-disk size. Subsequent saves overwrite the file as usual.

### Scrolling

The editor body scrolls vertically within the tab. After typing, the scroll position stays where it
was — the view does not jump to the top of the document.

After any cursor movement (typing, arrow keys, mouse click, page up/down), the caret is scrolled
into view to ensure it remains visible. Moving the cursor to a different line or column triggers the
scroll; staying in position does not.
