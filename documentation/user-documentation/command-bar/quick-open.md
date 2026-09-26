# Quick open

<img class="agent-float" src="/agents/mahir-south-west.png" alt="" />

`Cmd+P` jumps to any file in the project by typing a few characters of its name, without browsing the [file navigator](/user-documentation/tab-types/file-navigator) tree.

## Open the finder

Press `Cmd+P`. The Quick Open window floats above the command bar with its own text input already focused, so you can start typing right away. Before you type anything it shows a `type to search` hint.

The searchable set is every file under the directory the app was launched from. The list respects `.gitignore`, so `node_modules` and anything else your project ignores never appears. The window opens at once even for a large project; while the file list is still loading, the body shows `Searching…` and the input stays live.

## Filter the list

<img class="agent-float left" src="/agents/orhan-south.png" alt="" />

Typing narrows the list with a case-insensitive fuzzy match against each file's project-relative path. The characters you type must appear in the path in order, but not next to each other: typing `wsprof` can surface `web/src/ProfilePicker.tsx`.

A match on the filename itself ranks above a match found only in the directory part of the path, and tightly clustered matches rank above scattered ones: characters that sit next to each other, or that land right after a `/`, `-`, `_`, `.`, or the start of a new word inside the name, count for more than the same characters spread thinly across the path. When two paths score exactly the same, the shorter one comes first. The list shows the top 10 results, best first. Each row shows the filename plainly with its containing directory dimmed beside it.

If nothing matches, the window shows `No matching files`, and `Return` does nothing.

## Open a file

`↑`/`↓` move the highlighted selection, or click a row directly. `Return` opens the highlighted file in a [tab of the right kind for it](/user-documentation/tab-types/opening-files) and closes the window: the text editor for source, the image editor for an image, the [PDF viewer](/user-documentation/tab-types/pdf-viewer) for a PDF, the [markdown preview](/user-documentation/tab-types/markdown-preview) for Markdown, the video or audio player for media. It doesn't matter which tab was active when you pressed `Cmd+P`; the file always opens from the project root, with the same open and de-dupe behavior as any other way of opening a file.

`Escape` closes the window without opening anything and returns focus to the command bar.

## Results stay fresh

Each time you open the window it re-reads the project's file list, so files created or deleted since your last search show up correctly. While the window is open, typing re-filters the already-loaded list instantly, with no further requests. If you close the window before that read comes back, the answer is thrown away — reopening starts a fresh read rather than filling in the list you had walked away from.
