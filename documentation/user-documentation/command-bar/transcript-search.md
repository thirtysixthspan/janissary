# Searching a transcript

<img class="agent-float" src="/agents/yusuf-south-west.png" alt="" />

Press `Cmd+F` to search back through the current tab's transcript. The command bar turns into a search bar, marked with a `/`, and the tab's own history is what it searches.

```
search transcript deploy failed
```

The command does the same thing with the pattern already filled in. Bare `search transcript`, or a pattern that isn't valid, prints `Usage: search transcript <pattern>`.

## Stepping through matches

What you type is a regular expression, matched without regard to case, so `error|warn` finds either word and `^npm` finds only lines that start with it.

Above the input, a result line shows where you are and what you found:

```
3/17  npm ERR! code ELIFECYCLE
```

`↑` moves to an older match, `↓` back to a newer one. The count is numbered from the oldest match, so `17/17` is the most recent one in the tab and the bar starts you there. The match is also highlighted in place in the transcript above.

The transcript doesn't scroll to follow you. Reading the result line is how you scan matches; scroll up to the highlight when you find the one you want.

## When there's nothing to find

<img class="agent-float left" src="/agents/demir-south-east.png" alt="" />

A pattern that matches nothing shows `No matches`. A pattern that isn't valid regex shows `Invalid pattern`, and neither state changes what's on screen.

Two kinds of line are skipped: the output of an embedded terminal card, and the blank spacers between entries. Everything else in the transcript is searchable.

## Leaving search

`Escape` closes the bar and puts the cursor back on the command line. Switching to another tab closes it too, since a search only ever applies to the tab it was opened on.

`Cmd+F` opens a fresh, empty bar each time. There's no search history to walk back through, though the command form is kept in your [command history](/user-documentation/command-bar/history) like anything else you type.

## Where it works

Search needs a transcript, so it's available on agent tabs and nowhere else. A view tab has no transcript to search, and while an interactive program has taken over the tab the keyboard belongs to that program.

Run from a schedule or with [`send`](/user-documentation/command-bar/send), where no one is watching the bar, `search transcript <pattern>` writes its answer into the transcript instead: the most recent matching line, or `No matches found in the transcript.`

To search inside a file rather than a transcript, open it in the [editor](/user-documentation/tab-types/editor#find-a-line) and press `Cmd+F` there.
