# Shell commands

Type a shell command the way you'd type it in a terminal, and it runs in the tab's shell:

```
ls -la
git status
npm test
```

Output streams into the transcript line by line as it's produced, with ANSI colors and styling intact — a test suite's colored pass/fail summary looks the way it should. `file.ts:42`-style paths in the output are clickable and open the file in an [editor tab](/user-documentation/tab-types/editor) at that line.

![Shell command output rendered in the transcript beneath its prompt line.](/screenshots/shell-output.png)

Plain commands like these are recognized as shell input automatically. When a line could be read more than one way — a shell command, a SQL query, a prompt for the agent — the app asks instead of guessing, floating a chooser above the command bar; pick a route with `↑`/`↓` and `Return`, or `Escape` to cancel. To skip recognition entirely, prefix the line with `shell `:

```
shell find . -name "*.ts"
```

The prefix is the deterministic escape hatch — whatever follows it goes straight to the shell.

## One shell per tab, and it persists

<img class="agent-float" src="/agents/fariz-south-west.png" alt="" />

Each tab has its own shell process that lives as long as the tab does. State accumulates the way it would in a terminal: `cd` somewhere and later commands in that tab run there; exported variables stick around. The working directory is also remembered per agent, so after `janus --relaunch` a restored tab's shell starts where it left off. If the shell process dies unexpectedly, a fresh one is spawned on your next command.

Closing a tab kills its shell; quitting the app kills them all.

## Interactive programs take over the tab

<img class="agent-float left" src="/agents/tahir-south-east.png" alt="" />

Full-screen and interactive programs — `htop`, `vim`, `less`, `man`, `python` and other REPLs — can't run through the ordinary transcript. When you run one, the tab switches into a full-tab terminal: the transcript and command bar disappear and the program gets the whole tab, with every keystroke — including `Ctrl+C`, `Ctrl+D`, and `Ctrl+Z` — forwarded to it. Only `Shift+←`/`Shift+→` still switch tabs, and you can keep several tabs' interactive programs running at once; each keeps its screen state while you're elsewhere.

`Shift+Enter` inserts a line continuation rather than submitting, which matters for programs (AI harnesses in particular) that accept multi-line input.

When the program exits, the transcript comes back exactly as it was — nothing about the takeover is logged.
