# PDF viewer

<img class="agent-float" src="/agents/aslan-south.png" alt="" />

`open <file>.pdf` shows a PDF in its own tab, rendered inside Janissary rather than handed to your operating system.

```
open paper.pdf
```

`pdf <path>` does the same thing, and takes the same paths and wildcards `open` does. If that document is already open, either command focuses the existing tab instead of creating a duplicate.

The tab shows a compact header with the file's name, size, and location, the page you are on out of the document's total, and the view controls. The document fills the space below. The tab's name in the strip is the file name, and it carries a × close button, which closes that tab without selecting it first. Its internal label starts with `pdf` and gains a number when needed, such as `pdf-2`.

A PDF tab has no command bar and no transcript. You work it with the mouse, the header controls, and the keys below. The page and zoom controls appear once the document has loaded.

## Two ways to read

A PDF tab opens showing **one page at a time**, fitted to the tab. The stacked-pages button in the header switches to **continuous scroll**, where every page runs down one scrolling column, and back again. The button says what the click will do — `Continuous scroll` while you are on one page, `Single page` while you are scrolling — and switching keeps the page you were on.

| Control | Single page | Continuous scroll |
|---|---|---|
| **Previous page** / **Next page** buttons | Previous / next page; disabled at the ends | Hidden |
| `↑` / `↓` | Previous / next page | Scroll a step |
| `PageUp` / `PageDown` | Previous / next page | Scroll a screenful |
| Scroll wheel | Scroll | Scroll |

The keys only reach the PDF tab you are working in — one hidden behind another tab, or in the other split pane, ignores them. A PDF tab docked into a sidebar takes them once you click into it.

When the document overflows the stage, you can also drag its scrollbars to move through it.

## Jumping between pages

The pages button in the header shows a strip of page thumbnails down the left edge. It starts hidden, so a document you have just opened is all document. Click a thumbnail to jump to that page; the page you are on is highlighted as you scroll. The button reads `Show pages` or `Hide pages`, whichever the click will do.

The strip works in both layouts — it is as useful for skimming a long document you are scrolling as it is for picking a page. It is the only navigation panel: there is no outline of headings, no bookmark list, and no attachments panel, so a document that relies on one of those is best navigated by scrolling or by its own page numbers.

## Zoom

Pages stay fitted as you show or hide the page strip, split the pane, or dock the tab into a sidebar. Your zoom percentage stays the same.

| Control | Action |
|---|---|
| `+` in the header | Zoom in, 10% per step |
| `−` in the header | Zoom out, 10% per step |
| `Cmd`/`Ctrl` + scroll wheel | Zoom in / out |
| `Escape` | Back to 100% |

100% is the fit: the whole page on one page at a time, the page's width in continuous scroll. Zoom runs from 10% to 800%, and past 100% the stage scrolls in both directions to reach the rest of the page. While you are away from 100%, the current percentage is shown on the view. A plain scroll wheel always scrolls — it never zooms, unlike the [image viewer](/user-documentation/tab-types/image-viewer).

## Selecting text

<img class="agent-float left" src="/agents/bilal-south-east.png" alt="" />

The text of a PDF is selectable: drag across a passage and copy it with `Cmd+C` / `Ctrl+C`, and you get the document's own text, not a picture of it. A selection is highlighted in blue over the page, so you can see it in any theme. There is no in-app copy button.

`edit <file>.pdf` opens this same viewer, as does `Shift`+double-clicking a PDF in the [file navigator](/user-documentation/tab-types/file-navigator). Nothing in the tab writes to the file: there is no annotating, form filling, or signing.

## Finding text

While a PDF tab is open and its document has loaded, press `Cmd+F` to search it. A search field labeled `Search document` opens over the bottom of the tab. Use `Cmd+F`, not `Ctrl+F`.

Type a word or phrase. Search ignores case. The list shows the matching lines with their page numbers, and every match on the pages in view is marked, with the match behind the highlighted row marked more strongly. The whole document is searched, not only the pages you have looked at. The first search reads the document's text, so a long document shows `Reading pages…` while it works and fills in the results as it reads. If Find cannot read one page's text, it skips that page and continues searching the rest of the document without a notification. A screen reader hears when reading starts, when matching lines first appear, and the final count or `No matching lines`; it doesn't announce each page. When the ten-row list is full, it says `10 or more matching lines found.`

Case-insensitive matches stay aligned with the original text even when lowercasing changes a character's length.

Use `↑` / `↓` or click a row to jump to a match. When you are showing one page at a time, the match's page comes into view; in continuous scroll the page scrolls so the match sits about a quarter of the way down. If you are zoomed in, the page also scrolls to bring the match into view. `Return` jumps to the best match.

Matches stay within one line. A phrase that wraps to the next line, or a word hyphenated across a line break, is not found.

An empty field shows `type to search`; a query with no matches shows `No matching lines`. Closing the search clears the marks and leaves you on the match you were looking at. `Escape` closes it without changing the zoom; with the search closed, `Escape` still returns the zoom to 100%. Closing the search returns the keyboard to where it was, usually the page, so the page and zoom keys work again. Switching to another tab closes the search, and opening it again starts with an empty field.

Search works only once the document has loaded. While it is loading or after it fails to open, `Cmd+F` does nothing, and the browser's own find bar does not open.

## When a PDF won't open

If the document can't be rendered, the tab stays open and the body reads `Failed to load <name>`, and a line goes to your [notifications](/user-documentation/tab-types/notifications) saying why: `<name> is password-protected`, `<name> could not be read`, or `Could not display <name>` for anything else. Password-protected documents are reported rather than opened; there is no prompt to type a password. A single page that won't draw, or whose selectable text layer fails to render, lands on the same failed body with the same `Could not display <name>` line, and each tab reports it at most once so a long document with a handful of bad pages does not fill your feed. A render you cancel or replace, a page that is simply not drawn yet, and a thumbnail that will not draw are none of them a failure and report nothing.

## Lifecycle

Closing a PDF tab also stops any document load still in progress. A result that arrives after the tab is gone changes nothing and reports nothing.

A PDF tab is a live view, not saved state: the layout, zoom, and page you were on belong to that tab and are not restored. A second PDF you open starts on page one, fitted, with the strip hidden, whatever you switched the first one to. A [profile](/user-documentation/automation/profiles) is the exception: it can open a PDF tab by its file on launch, even though the tab is otherwise a live view. Closing a tab, via its × button or `close`, just removes the view; the file is untouched. Only files you've explicitly opened are ever served to the viewer, and everything needed to render them ships with the app, so a PDF opens the same way offline or on a remote server.

Two things about the file itself are worth knowing. The document is the file as it was when you opened it, so a PDF that is regenerated on disk keeps showing you the old copy until you open it again. And pages are drawn only as they come close to the view, in the stage and in the strip alike, so a long document doesn't draw every page up front. A page you have scrolled past stays drawn. The tab still reads every page's size before it shows the document, so a document of several hundred pages takes longer to appear than a short one. Until it has loaded, you see only the header with the file's name, size, and location.

<img class="agent-float" src="/agents/tahir-south.png" alt="" />

To hand a PDF to your system's PDF application instead, use `open external <file>.pdf` — see [Opening files and pages](/user-documentation/tab-types/opening-files). You can name which application that should be with the `externalViewers` setting. If nothing can open the file, you get `No PDF viewer available. The file is at <file>`.
