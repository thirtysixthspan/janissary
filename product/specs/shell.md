# Captured shell execution

`ShellManager` provides persistent, per-tab captured shell execution for core command dispatch. The interactive zsh tab is a separate bundled plugin with its own terminal and command bar; see [[shell-tab]]. Harness terminals are described in [[harness]].

## Startup and command framing

The user's login shell is started lazily. Bash uses `--norc --noprofile` and zsh uses `--no-rcs` so startup banners do not pollute captured replies. Commands and their completion sentinel are written as one shell line, stderr is captured with stdout, and the tab's working directory is queried afterwards.

## Streaming and lifecycle

`ShellManager.run` creates a running log entry, streams captured output into it, finalizes it on completion, and clears the busy marker. Shell interactions are serialized per tab. Closing the tab or shutting down releases its process; a shell that exits by itself ends the current command with `(shell exited)`. A later command starts a fresh shell. Closing a shell connection leaves the tab open and finalizes its running command.

Remote command capture uses the existing tab's SSH channel; local execution uses the tab's workspace and offline confinement where present. The shell plugin sends its own shell commands directly to zsh and renders application-command replies in its terminal. It does not use this captured-shell service for ordinary zsh input.
