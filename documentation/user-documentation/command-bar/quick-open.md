# Quick open

<img class="agent-float" src="/agents/mahir-south-west.png" alt="" />

`Cmd+P` jumps to any file in the project by typing a few characters of its name, without browsing the [file navigator](/user-documentation/tab-types/file-navigator) tree.

## Open the finder

Press `Cmd+P` while the app has keyboard focus. The Quick Open window floats above the command bar with its own text input already focused, so you can start typing right away. Before you type anything it shows a `type to search` hint. A focused full-screen harness or SSH terminal sends `Cmd+P` to its program, and an embedded web page keeps the key for its browser; switch to another app tab to open Quick Open.

The searchable set is every file under the directory the app was launched from, and only files: folders are never listed. In a Git project that means every tracked file plus every untracked file your `.gitignore` doesn't exclude, so `node_modules` and anything else your project ignores stays out. If the directory isn't in a Git repository, or Git can't list it, Quick Open walks the folders itself instead. That walk doesn't read `.gitignore`, so `node_modules` and build output do appear. It skips only `.git`, `.svn`, `.hg`, `.DS_Store`, and `Thumbs.db`.

The window opens at once even for a large project. While the file list is still loading, the body shows `Searching…` and the input stays live.

## Filter the list

<img class="agent-float left" src="/agents/orhan-south.png" alt="" />

Typing narrows the list with a case-insensitive fuzzy match against each file's project-relative path. The characters you type must appear in the path in order, but not next to each other: typing `wsprof` can surface `web/src/ProfilePicker.tsx`. Spaces at either end of what you type are ignored, so a query of only spaces counts as empty and shows the `type to search` hint.

Each matched character earns a point, and some earn more. A character scores extra when it sits in the filename rather than the folders, when it starts a word, and when it comes straight after the previous matched character. A character starts a word when it is the first in the path, comes right after `/`, `-`, `_`, `.`, or a space, or is a capital letter that follows a character that isn't a capital. So tightly clustered matches rank above scattered ones. When two paths score exactly the same, the shorter one comes first, then the one that sorts first alphabetically. The list shows the top 10 results, best first. Each row shows the filename plainly with its containing directory dimmed beside it.

If nothing matches, the window shows `No matching files`, and `Return` does nothing. The same is true if Janissary can't read the file list at all: the `Searching…` state clears, the window behaves as if the project had no files, and closing and reopening it tries the read again.

## Open a file

The top row is highlighted whenever results appear. `↑` and `↓` move the highlight one row at a time and stop at the first and last rows instead of wrapping around. You can also click a row to open it directly. The highlight keeps its row position as you type, so if you've moved down the list and then narrow it to fewer rows, the highlight can end up below the last row and `Return` does nothing. Press `↓` to bring it back onto the last row.

`Return` opens the highlighted file the way `edit <file>` does, and closes the window. An image opens in the image editor and a PDF in the [PDF viewer](/user-documentation/tab-types/pdf-viewer). Every other file, Markdown included, opens as text in the editor. Quick Open never picks a preview or player for you; to view a file that way, close the window and use `open`. [Opening files and pages](/user-documentation/tab-types/opening-files) covers what each command opens, including the 2 MB limit on files the editor accepts. The file list is rooted at the project directory, regardless of the command bar's working directory. The new tab follows the same open and de-duplicate behavior as any other way of opening a file.

`Escape` closes the window without opening anything and puts keyboard focus back on whatever had it when you pressed `Cmd+P`, which is usually the command bar. Picking a file closes the window without handing focus back, because the file's tab opens instead.

## Results stay fresh

Each time you open the window it re-reads the project's file list, so files created or deleted since your last search show up correctly. While the window is open, typing re-filters the already-loaded list instantly, with no further requests. If you close the window before that read comes back, the answer is thrown away. Reopening starts a fresh read rather than filling in the list you had walked away from.
