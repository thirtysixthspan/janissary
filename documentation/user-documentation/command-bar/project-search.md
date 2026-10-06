# Searching the project

<img class="agent-float" src="/agents/fariz-south-west.png" alt="" />

The search tab finds every place a phrase appears across your whole project and opens any match in the editor on the right line. Type the phrase on the command line:

```
search parseConfig
```

Or press `Cmd+Shift+F` from any tab, which does the same as a bare `search`. Use [Quick open](/user-documentation/command-bar/quick-open) when you know a file's name and want to jump to it. Use the search tab when you want to know where something is used.

## Open the search tab

There is only ever one search tab, titled `search`. Bare `search` opens it, or focuses it if it's already open. `search <phrase>` opens or focuses it and searches for that phrase straight away. If the tab is already open, the phrase replaces whatever was in its search bar and becomes the most recent entry in its term history.

While the tab stays open, it keeps your last query, its results, and the two file fields. So `Cmd+Shift+F` takes you back to where you left off. Closing the tab forgets all of that, and the next search tab starts empty. Only the three toggles carry over.

## Type a search

The search bar sits at the bottom of the tab, with the prompt `search >`. Results update a moment after you stop typing, so you don't press `Return` to search. Emptying the bar clears the results and shows `Type to search`. A bar holding only spaces counts as empty.

![The search tab with "tides" typed in its search bar. Above it, three matches from src/tides.ts and sample.md are stacked upward, each with a dimmed file-and-line header and the lines around the match. Two empty file fields sit across the top, and the three toggles sit at the right end of the search bar.](/screenshots/search-tab.png)

Three toggles sit at the right end of the search bar. Each one is off by default, and each change reruns the search at once:

| Toggle | When on |
|---|---|
| `.*` **Regular expression** | The query is a regular expression. Off, it is plain text, and punctuation matches itself. |
| `Aa` **Match case** | The query is case-sensitive. |
| `W` **Whole word** | A match must be a whole word, not part of a longer one. Works with the other two. |

The toggles are remembered across restarts, so the tab opens with them the way you left them. Your query, the file fields, and the term history are not remembered.

<img class="agent-float left" src="/agents/idris-south-east.png" alt="" />

A regular expression that doesn't compile starts no search. The tab shows the reason in the engine's own words, such as `Invalid regular expression: /[unclosed/i: Unterminated character class`. The same line goes into the transcript of the tab you opened the search from. Fix the pattern and the next one that compiles searches as usual.

With the search bar focused, `↑` steps back through the terms this tab has searched and `↓` steps forward again. Stepping past the newest term brings back what you were typing. Searching a term again moves it to the newest place rather than listing it twice.

## Choose which files to search

The search covers every file under the directory the app was launched from that `.gitignore` doesn't exclude. That's the same set Quick open uses. Two kinds of file are skipped: files too large for the editor to open, and binary files.

The **Files to include** and **Files to exclude** fields across the top narrow that set. Each takes glob patterns separated by commas, such as `*.md, docs`, and editing either one reruns the search.

A pattern with no `/` in it matches at any depth, so `*.md` finds Markdown files in every folder. A pattern with a `/` is anchored to the project root, so `src/*.ts` covers `src/` and nothing below it. A plain name that isn't a wildcard also names a folder and everything inside it, so `docs` works like `docs/**`. A leading `./` or a trailing `/` changes nothing.

An empty include searches everything, and an empty exclude removes nothing. When both name a file, the exclude wins. A pattern that matches nothing narrows the search to nothing. Because the comma always separates patterns, you can't use a brace list like `{a,b}`.

## Read the results

Each match gets its own entry. The entry has a dimmed header with the file's path and the line number, then the match with two lines of context above and two below. A thin rule separates one entry from the next. When the matching line is long enough to wrap, the entry shows the part of it around the match instead of the lines next to it.

Results stack upward. The first match sits at the bottom of the window, just above the search bar, and later matches build up above it. Rows appear while the search is still running, and the window stays on the first match so nothing scrolls away while you read.

A search stops after 250 matches. There's no count of matches or files anywhere in the tab. The body shows `Searching…` while a search runs, and `No matches found for "<query>".` when one finishes with nothing.

If one matching step takes longer than one second, the search ends with an error reason. Any rows already found stay visible, and you can run another query normally.

## Open a match

<img class="agent-float" src="/agents/selim-south.png" alt="" />

`Tab` moves focus from the search bar to the results, and `Tab` again moves it back. `Shift+Tab` still moves focus out of the tab as usual. Clicking an entry selects it and focuses the results.

With the results focused, `↑` moves up the window to a later match and `↓` moves down to an earlier one. They stop at the ends rather than wrapping. `Home` and `End` jump to the first and last match. Press `Return` to open the selected match, or double-click any entry.

Opening a match puts the file in an [editor tab](/user-documentation/tab-types/editor) with the matching line centered. A file that's already open is focused rather than opened twice. The search tab stays open with its query and results, so you can open the next match without searching again.

The search tab is a live view. It isn't restored by `janus --relaunch`.
