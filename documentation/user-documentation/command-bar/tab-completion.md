# Tab completion

<img class="agent-float" src="/agents/ahmed-south-west.png" alt="" />

Press `Tab` to complete the token just before the cursor. One match replaces the token outright — with a trailing `/` for a directory or a space for a file. Several matches fill in their longest common prefix and list the candidates above the command bar; no match does nothing. That list of candidates is there to be read, not chosen from: there is no key that moves through it and no way to accept one, so keep typing to narrow the token down and press `Tab` again when the answer is what you have.

What gets completed depends on where in the command you are:

| Context | Candidates |
|---|---|
| The recipient of `msg` | Every open tab's label, not just agents |
| The recipient of `broadcast` | The same labels, plus `all`; completes each segment of a comma-separated list (`ahmed,bil` → `ahmed,bilal`) |
| The target of [`send`](/user-documentation/command-bar/send), [`queue`](/user-documentation/command-bar/queue), or `close` / `exit` | Every open tab's label |
| The tab in a [`schedule … in <tab>`](/user-documentation/automation/scheduling#scheduling-into-another-tab) clause | Every open tab's label |
| The target of [`connection close`](/user-documentation/command-bar/connections) | Open connection strings, the same ones `connection list` prints (`sqlite:my-db`, `shell:bash`, `acp:opencode/big-pickle`, `browser:w1`, `ssh:my-host`, `terminal:vim`) |
| After `browser` | Browser subcommands; for those that take a window id (`browser use`, `browser window close`), the current tab's open window ids |
| After `harness <name>`, at `--model` | That harness's known model names; `--model` may sit anywhere after the harness name |
| After `syntax` | `theme` at the first argument, and the available theme names after it |
| After `search` | `transcript`, its only subcommand |
| Anywhere else | Filesystem paths, relative to the tab's working directory |

Path completion expands `~` to your home directory, and hides dotfiles unless what you've typed already starts with a `.`.
