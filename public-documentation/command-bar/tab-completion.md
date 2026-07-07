# Tab completion

<img class="agent-float" src="/agents/malik-south-west.png" alt="" />

Press `Tab` to complete the token just before the cursor. One match replaces the token outright — with a trailing `/` for a directory or a space for a file. Several matches fill in their longest common prefix and list the candidates above the command bar; no match does nothing.

![The command bar mid-completion: a partially typed path on the input line with the matching candidates listed above it.](/screenshots/tab-completion.png)

What gets completed depends on where in the command you are:

| Context | Candidates |
|---|---|
| The recipient of `msg` | Active agent names |
| The recipient of `broadcast` | Active agent names, plus `all`; completes each segment of a comma-separated list (`ahmed,bil` → `ahmed,bilal`) |
| The target of `connection close` | Open connection strings (`sqlite:my-db`, `shell:bash`, `acp:opencode`, `browser:w1`) |
| After `browser` | Browser subcommands; for those that take a window id (`browser use`, `browser window close`), the current tab's open window ids |
| Anywhere else | Filesystem paths, relative to the tab's working directory |

Path completion expands `~` to your home directory, and hides dotfiles unless what you've typed already starts with a `.`.
