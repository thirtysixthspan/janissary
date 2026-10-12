# Remote host override for agent runs

**Complexity: 7/10** — The change connects existing SSH provisioning and remote workspace lifecycle to agent runs while retaining caller-context command authority.

## Goal

Make `on <host>` select a remote execution host from local or remote callers. Reuse an established matching project when available; otherwise provision the requested project through Janissary's existing remote connection and SSH-root lookup. Never run locally after a remote target fails.

## Approach

Keep `parseAgentCommand` as a pure header parser. Resolve the host selector in the command execution layer. A matching established remote workspace can be borrowed with the existing lease mechanism. For a distinct host, create a run-only remote connection using the parsed `[user@]host[:path]` address and existing remote workspace negotiation, with non-interactive SSH authentication so a headless run cannot hang on a prompt. A pathless target uses the remote server's existing project lookup from the SSH login directory. Release the temporary channel label after acquiring the run lease so cleanup closes only resources owned by this run.

Resolve task and skill snapshots through the selected execution channel, preserving remote-host resolution. Keep the original captured caller context for Janissary command dispatch, caller output, question routing, and authorization. Retain the current inherited remote-workspace behavior when no host is selected, including `in workspace <label>` sharing.

## Implementation steps

1. Add a run-scoped remote target resolver that selects a matching established channel or provisions a distinct target, waits for readiness, acquires its lease, and unwinds every partially acquired resource on failure.
2. Extend the existing remote channel creation path with non-interactive SSH options for agent-owned connections; retain ordinary interactive remote shell launches.
3. Integrate host resolution into `agent` without changing the caller's command invocation context or local fallback semantics.
4. Add command and remote-manager/channel tests for local-to-remote selection, switching between remote hosts, pathless project lookup, execution-host snapshot resolution, caller-context grants, unavailable-target failure, and cleanup. Preserve established-workspace sharing coverage.
5. Update `product/specs/agent-command.md`, the ready remote execution plan's stated scope, and the existing agent command user guide. Record this completed fix plan and remove only its PR backlog entry.

## Tests

Cover both reuse of a matching established remote workspace and creation of a separate run-only connection for a new host. Assert a pathless target uses the remote login-directory project lookup, task and skill snapshots come from the execution host, Janissary commands retain the original caller context, failed SSH/readiness never reaches local execution, and temporary channel/workspace references are released after success and failure. Test non-interactive SSH command construction and preserve normal interactive remote launch behavior.

## Out of scope

Changing the `agent` grammar, adding remote workspace selection UI, changing remote project lookup semantics, creating a local fallback, changing caller-context command authority, or modifying other PR backlog entries.
