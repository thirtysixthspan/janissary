# WebSocket agent-run merge

Status: complete

The WebSocket client uses the agent-monitor contract as the authority for deciding whether a tab owns an agent-run update. The shared contract exports the plugin id, and the merge uses `isAgentMonitorPayload` rather than a weaker local payload check.

The `agent-run-updated` projection is a pure module beside `ws.ts`. It preserves the tab-label match and strictly-newer revision rule, and the client publishes the resulting state. A client test pins rejection of a monitor payload with an empty run id.

The stale notification and page-sync comments were removed, and the `state`, `pty`, and `pty-exit` switch formatting was normalized. Existing TypeScript, Vite, and Vitest `@shared` aliases resolve the runtime contract import.

This fixes which existing tabs receive an update and does not change the user-facing monitoring contract, so no spec or user-documentation change was needed.
