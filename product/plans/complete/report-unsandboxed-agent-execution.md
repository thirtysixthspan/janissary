# Report when agent execution is not sandboxed

Complexity: 5/10

## Goal

Report `Agent: sandboxing is disabled.` in the notifications feed when a local or remote agent's ACP process will not be confined. The host that launches the process determines the state. Do not duplicate the notice in caller output or monitor activity.

## Approach

Use the same workspace, configuration, and Seatbelt-availability predicate that controls `sandboxSpawn`. For remote runs, include that predicate's result in the remote ACP readiness response; never derive remote state locally. Emit one explicit notification after local spawn configuration or remote readiness is established.

## Implementation steps

1. Expose the confinement decision used by `sandboxSpawn` and use it for local agent notification.
2. Carry the remote host's confinement result on `acp-ready`, validate it, and notify locally only when the remote host reports no confinement.
3. Add focused local and remote execution tests for confined, disabled, and unavailable states, checking the feed entry and absence of caller transcript or monitor duplicates.
4. Update `product/specs/agent-command.md` to specify the notice for both execution hosts.
5. Extend the existing agent-command user guide to explain that remote notices reflect the remote host.

## Tests

- Local agent execution reports exactly one notifications-feed entry when the sandbox toggle is off or confinement is unavailable, and none when confined.
- Remote ACP readiness reports its own host state; local execution reports exactly one feed entry only when the remote host is unconfined, regardless of local confinement.
- The exact notice does not enter caller response/transcript or monitor activity.
- The remote frame decoder accepts and rejects the confinement state according to its boolean contract.

## Out of scope

- Changing sandbox policy, command grants, agent results, or monitor projections.
- Changing notifications behavior beyond this explicit agent-run notice.
