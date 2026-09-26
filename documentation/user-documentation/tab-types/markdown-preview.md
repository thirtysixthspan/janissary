# Markdown preview

<img class="agent-float" src="/agents/cavus-south-west.png" alt="" />

`open <file>.md` renders a Markdown file in its own tab:

```
open README.md
```

The file is rendered as a document page, colored by the [application theme](/user-documentation/command-bar/commands#theme) you have active — the same headings, code blocks, tables, and links the app uses everywhere else, on that theme's background and text colors, with selected text highlighted in a shade you can always pick out. GitHub-flavored Markdown is supported: headings, lists, tables, task lists, fenced code blocks, blockquotes, and links. A single newline inside a paragraph becomes a line break, so a file you hard-wrapped for the terminal comes out one line per source line rather than joined the way GitHub would join it. A header shows the file's name, size, and location, with a **Split** control at its right edge. In the strip the tab is named after the file and carries a × close button, which closes it without selecting it first. Both `.md` and `.markdown` files are recognized, whatever case they're written in, and a wildcard like `open docs/*.md` opens each match in its own tab. Opening a file you already have a preview of focuses that tab instead of opening a second one (see [Opening files and pages](/user-documentation/tab-types/opening-files)).

There is no command line and no command history here, so no command can be typed into a markdown tab; `close markdown` from another tab is how you close one you aren't looking at. The new tab lands in the same [group](/user-documentation/getting-started/groups) as the tab you ran the command from, with its own dot color, and takes focus. It is an ordinary member of that group: move it within the band and the rest of the strip reads it like any other tab. Each preview also carries an internal name you never see — `markdown`, then `markdown-2`, and so on — which is what lets several of them sit side by side and what `close markdown` goes by. A [profile](/user-documentation/automation/profiles) can record a preview by its file and reopen it on launch.

![A markdown tab rendering a document: headings, a list, a table, and a highlighted code block filling the tab under its metadata header.](/screenshots/markdown-tab.png)

## Scrolling

The rendered page scrolls vertically, with a visible scrollbar — there's no zoom or panning. It opens at the top, and where you leave it belongs to that tab alone: nothing about the position is saved, so `janus --relaunch` does not bring it back.

| Control | Action |
|---|---|
| `↑` / `↓` | Scroll a short step, a little over two lines |
| `PageUp` / `PageDown` | Scroll by roughly a page |
| Mouse wheel | Scroll |

The keys only reach the preview you are looking at. A markdown tab behind another tab, or in the other split pane, ignores them.

## What to expect

<img class="agent-float left" src="/agents/demir-south.png" alt="" />

The view is a snapshot of the file as it was when you opened it — edits on disk aren't picked up until you open it again. If the file disappears or cannot be read while the view is loading, the tab shows `Failed to load <name>` instead of an empty document or server error page. Relative links to other local files (an image referenced as `./diagram.png`, say) aren't resolved; only the Markdown text itself renders. Active markup in the file is stripped before rendering, and a file that fails to parse falls back to plain text.

Like the other view tabs, a markdown tab is a live view: it isn't restored by `janus --relaunch`, and closing it (× button or `close`) just removes the view. To open the file in the OS default viewer instead, use `open external <file>.md`. To *edit* a Markdown file, use `edit` — see [Editor](/user-documentation/tab-types/editor).
