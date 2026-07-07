# Markdown preview

`open <file>.md` renders a Markdown file in its own tab:

```
open README.md
```

The file is rendered as a document page — white background, dark text — with GitHub-flavored Markdown support: headings, lists, tables, task lists, fenced code blocks, blockquotes, and links. A header shows the file's name, size, and location. In the strip the tab is labeled `markdown` and carries a × close button. Both `.md` and `.markdown` files are recognized, and a wildcard like `open docs/*.md` opens each match in its own tab (see [Opening files and pages](/tab-types/opening-files)).

![A markdown tab rendering a document: headings, a list, a table, and a highlighted code block on a white page.](/screenshots/markdown-tab.png)

## Scrolling

The rendered page scrolls vertically, with a visible scrollbar — there's no zoom or panning:

| Control | Action |
|---|---|
| `↑` / `↓` | Scroll by a line |
| `PageUp` / `PageDown` | Scroll by roughly a page |
| Mouse wheel | Scroll |

## What to expect

<img class="agent-float left" src="/agents/fariz-south-east.png" alt="" />

The view is a snapshot of the file as it was when you opened it — edits on disk aren't picked up until you open it again. Relative links to other local files (an image referenced as `./diagram.png`, say) aren't resolved; only the Markdown text itself renders. Active markup in the file is stripped before rendering, and a file that fails to parse falls back to plain text.

Like the other view tabs, a markdown tab is a live view: it isn't restored by `janus --relaunch`, and closing it (× button or `close`) just removes the view. To open the file in the OS default viewer instead, use `open external <file>.md`. To *edit* a Markdown file, use `edit` — see [Editor](/tab-types/editor).
