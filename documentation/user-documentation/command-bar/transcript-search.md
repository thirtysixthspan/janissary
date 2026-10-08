# Search application replies

```
search transcript error
```

<img class="agent-float" src="/agents/yusuf-south-west.png" alt="" />

In a shell command bar, this searches the application replies and core ACP entries that Janissary keeps for that tab and prints the most recent matching line. It does not search zsh's terminal scrollback or the shell's native command history.

Patterns are regular expressions matched without regard to case. No match prints `No matches found in the transcript.`. A missing or invalid pattern prints `Usage: search transcript <pattern>`.

To search a file, use `Cmd+F` in the [editor](/user-documentation/tab-types/editor#find-a-line). Use `Cmd+Shift+F` for [project search](/user-documentation/command-bar/project-search).
