# Document remote agent host overrides

**Complexity: 2/10** — This is a spec-only correction that records behavior already implemented by remote agent execution and protocol version 31.

## Goal

Bring `product/specs/remote-server.md` up to date with agent host selection from local and remote callers, task and skill resolution on the execution host, and the current remote wire contract.

## Approach

Document the new `agent-resolve` / `agent-resolve-result` task-snapshot exchange and its bounded wait alongside the version-30 behavior, then record version 31's `acp-ready.sandboxed` field and why an older peer must be rejected. Replace the outdated established-workspace-only summary with the caller/target selection flow, shared workspace leases, caller-context command policy, execution-host resolution, no-local-fallback rule, and bounded readiness and release waits. Match the exact language and timings in `product/specs/agent-command.md` and the remote protocol implementation.

## Implementation steps

1. Verify the relevant implementation in `src/remote/protocol.ts`, `src/remote/protocol-frames.ts`, and the remote agent request/ACP paths, plus the remote-agent sections of `product/specs/agent-command.md`.
2. Update only the protocol history and remote autonomous-agent section in `product/specs/remote-server.md`.
3. Re-read the full changed sections, compare the focused diff against the implementation and agent-command spec, and run the documentation-only diff check.
4. Promote this plan to complete and remove only the selected entry from `product/backlog/pull-request.md`.

## Tests

No application tests were needed for this documentation-only change. The recorded review scope is comparison of the complete remote-agent section and protocol history against `src/remote/protocol.ts`, `src/remote/protocol-frames.ts`, and `product/specs/agent-command.md`, plus focused-diff inspection. No diff-check result is recorded here.

## Out of scope

Do not change implementation, tests, `product/specs/agent-command.md`, user documentation, the PR description, or any other backlog entry.
