# Search a transcript

```
search transcript error
```

<img class="agent-float" src="/agents/yusuf-south-west.png" alt="" />

In a shell command bar, this opens a search over everything the terminal shows, its scrollback included, with `error` already typed in. Press `Cmd+F` in a shell tab to open the same search empty. It is the [editor's line search](/user-documentation/tab-types/editor#find-a-line), labeled `Search transcript`:

```
Search transcript
 112  npm ERR! code ERESOLVE
 140  error TS2307: Cannot find module './config'
```

Up to ten matching lines are listed with their line numbers. The characters you type must appear together, and case doesn't matter. `↑`/`↓` move down the list and scroll the terminal to each line, selected so you can copy it. `Return` goes to the first match. `Escape` closes the search and puts the cursor back in the command bar. A line that wrapped on screen counts as one line.

The list shows the terminal as it was when the search opened. Output that arrives while it is open shows up the next time you open it. Replies drawn as formatted blocks, such as `help`'s, aren't searched. `search transcript` here never reaches zsh, and it is saved in the tab's command history like any other line.

Sent from somewhere other than a shell command bar, such as a `send` or a script, the command searches the application replies and core ACP entries that Janissary keeps for the tab and prints the most recent matching line. Patterns are regular expressions matched without regard to case. No match prints `No matches found in the transcript.`. A missing or invalid pattern prints `Usage: search transcript <pattern>`.

To search a file, use `Cmd+F` in the [editor](/user-documentation/tab-types/editor#find-a-line). Use `Cmd+Shift+F` for [project search](/user-documentation/command-bar/project-search).
