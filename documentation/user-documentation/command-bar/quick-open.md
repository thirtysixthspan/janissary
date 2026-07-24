# Quick open
<img class="agent-float" src="/agents/mahir-south-east.png" alt="" />

<img class="agent-float left" src="/agents/orhan-south-west.png" alt="" />

`Cmd+P` jumps to any file in the project by typing a few characters of its name, without browsing the [file navigator](/user-documentation/tab-types/file-navigator) tree.

## Open the finder

Press `Cmd+P`. The Quick Open window floats above the command bar with its own text input already focused, so you can start typing right away. Before you type anything it shows a `type to search` hint.

The searchable set is every file under the directory the app was launched from. The list respects `.gitignore`, so `node_modules` and anything else your project ignores never appears. The window opens at once even for a large project; while the file list is still loading, the body shows `Searching…` and the input stays live.

## Filter the list

Typing narrows the list with a case-insensitive fuzzy match against each file's project-relative path. The characters you type must appear in the path in order, but not next to each other: typing `wsprof` can surface `web/src/ProfilePicker.tsx`.

A match on the filename itself ranks above a match found only in the directory part of the path, and tightly clustered matches rank above scattered ones. The list shows the top 10 results, best first. Each row shows the filename plainly with its containing directory dimmed beside it.

If nothing matches, the window shows `No matching files`, and `Return` does nothing.

## Open a file

`↑`/`↓` move the highlighted selection, or click a row directly. `Return` opens the highlighted file in an [editor tab](/user-documentation/tab-types/editor) and closes the window. It doesn't matter which tab was active when you pressed `Cmd+P`; the file always opens from the project root, with the same open and de-dupe behavior as any other way of opening a file.

`Escape` closes the window without opening anything and returns focus to the command bar.

## Results stay fresh

Each time you open the window it re-reads the project's file list, so files created or deleted since your last search show up correctly. While the window is open, typing re-filters the already-loaded list instantly, with no further requests.
