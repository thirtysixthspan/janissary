# Remote agent execution and acknowledged cleanup

**Complexity: 8/10** — This extends the existing remote ACP channel across command execution, per-run ownership, workspace references, cancellation, and protocol compatibility. Its original scope required an established matching remote workspace; the follow-up `remote-agent-host-override` plan extends selection to local callers and distinct hosts through run-only SSH sessions.

## Goal

Allow a canonical agent run to execute its ACP agent on an established remote workspace while preserving local command policy, delivering typed activity, and settling cleanup only after the remote acknowledges release or a bounded warning is recorded.

## Approach

For an inherited remote run, use the caller tab's established remote channel as the execution host. This plan originally required `on <host>` to match that channel and prohibited a second workspace. The follow-up `remote-agent-host-override` plan supersedes that selector restriction: it supports local callers and host switching by reusing a matching established channel or creating a run-only SSH session that uses existing remote project-root lookup. Neither path falls back to local execution. Resolve task and skill snapshots against the selected remote workspace and its remote Janissary installation through an explicit remote agent request. Keep command extraction and grants on the local server, bound to the original caller context. Add protocol frames for remote activity and close acknowledgments, and carry the autonomous policy and session configuration in the request. Increment the exact-match remote protocol version so an older peer refuses the request at handshake.

An agent run retains only a run-owned reference to the remote session/workspace and releases it during cleanup. Closing or detaching the caller, or losing transport, aborts the run. Close and release acknowledgments have bounded waits; missing acknowledgments and transport loss become cleanup warnings rather than hangs or false success. Shared workspace users remain alive when a run releases its own reference.

## Implementation steps

1. Extend the shared remote ACP contract with autonomous configuration, typed activity, close/release acknowledgments, and the protocol-version rationale. Add strict decoders and handshake compatibility coverage.
2. Add request/readiness and acknowledgment tracking to the remote channel and ACP host. Keep ACP session failures isolated from the channel, route activity only to its run, and make close idempotent.
3. Integrate the remote adapter with canonical agent execution on the inherited established remote tab. Resolve execution inputs on the remote host, preserve local command authorization, acquire a run-only reference, and abort/await cleanup on caller close, detach, and transport loss. Distinct-host provisioning and local-to-remote selection are added by the follow-up host-override plan.
4. Bound readiness and close waits, report cleanup warnings in the structured result, and ensure cleanup attempts every release without releasing references held by other tabs or runs.
5. Add protocol, channel, server, command, and lifecycle tests for version mismatch, readiness timeout, activity, borrowed shared workspaces, detach/transport loss, close acknowledgment, and timeout warnings.
6. Update `product/specs/agent-command.md` and `product/specs/remote-server.md` to describe the supported remote behavior, refusal cases, and cleanup outcomes.
7. Update the existing agent-command user guide because it currently states that remote selectors are unsupported.

## Tests

Extend `src/remote/protocol.test.ts`, `src/remote/channel/index.test.ts`, `src/remote/serve-acp.test.ts`, and `src/commands/agent.test.ts`; add focused lifecycle coverage beside the run/manager modules. Pin old-peer refusal, typed event validation, readiness and close acknowledgments, transport-loss abort, bounded waits, cleanup warning preservation, and shared-reference survival.

## Out of scope

Do not alter unrelated backlog items, reviewer findings, PR description text, or local agent execution semantics. Distinct-host selection and its run-only SSH channel are outside this plan's original implementation and are recorded in the follow-up host-override plan.
