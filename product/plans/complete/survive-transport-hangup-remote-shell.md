# Keep a detached remote agent's shell running on its host

Issue: when an agent is detached the remote shell is terminated, so reattaching reports `<label> on <host> ended` instead of returning the agent to its shell.

Complexity: 3/10

## Goal

A detached remote agent's persistent shell keeps running on its host, so the reattach that follows finds it in the peer's process table and restores the agent to it.

## Approach

Detaching parks the peer by dropping the ssh transport. On the far side `sshd` hangs the session up, which sends `SIGHUP` to the process group the remote server and everything it spawned share. The remote server handles that signal and parks itself; a remote harness survives because its pseudo-terminal put it in a session of its own; but an agent tab's persistent shell is spawned with plain pipes in the server's own process group, takes the default `SIGHUP` action, and dies. The peer then reports an empty process list, and the reattach reads that as a session with nothing left in it.

Give the pipe-mode shell its own process group when it is spawned, so the transport's hangup cannot reach it. Because the shell is then no longer in a group anything else will clean up, ending it deliberately has to end its group rather than just the shell, or a command still running under it would be left behind on the host when the session is shut down.

Only the remote server asks for this. A local tab's shell has no ssh transport to be hung up by and stays exactly as it is.

## Implementation steps

1. Give `spawnShell` an options argument with a `detached` flag that puts the shell in its own process group, and add a `killShellGroup` helper that ends such a shell together with everything still running under it, falling back to the plain kill when the group signal cannot be delivered.
2. Have the remote server's pipe-mode spawn request a detached shell and end it through `killShellGroup`.
3. Add regression coverage for both.

## Tests

- `spawnShell` spawns in the caller's process group by default and in its own when asked to detach.
- `killShellGroup` signals the shell's whole process group, and falls back to killing the shell alone when that signal throws.
- The remote server's pipe-mode spawn asks for a detached shell.
- Killing a remote pipe-mode process ends its process group.

## Specs / docs

Update `product/specs/sessions-tab.md` to state that a detached remote agent's shell keeps running on its host until the session is reattached or ended. No existing help or public documentation describes this behavior.

## Out of scope

The harness-tab close finding still listed in `product/backlog/pull-request.md`, ssh authentication, and the local shell manager's own lifecycle.
