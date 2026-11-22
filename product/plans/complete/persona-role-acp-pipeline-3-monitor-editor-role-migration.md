# Monitor and editor persona sessions run on the role pipeline

**Complexity: 5/10** — ~40 added production lines across 6 edited server files, 8 requirements and 9 scenarios (p=5.618)

## Goal

Move monitor sessions and in-editor persona suggestions off the persona-specific launcher and the raw `AcpSession.prompt` call onto the shared core ACP role entry from subplan 2. One persistent-session owner serves both, keyed by the persona's resolved role name, while the monitor's priming, the editor's incremental priming and hunk parsing, and the existing connection, close, death, and transcript behavior keep working.

Dependencies: the source plan `product/plans/complete/persona-role-acp-pipeline.md`, `product/plans/ready/persona-role-acp-pipeline-1-persona-role-format.md`, and `product/plans/ready/persona-role-acp-pipeline-2-core-role-session-pipeline.md`.

## Requirements

1. "Migrate editor agent support to the same acp pipeline that the ask and tell commands use." (source requirement 3)
2. "Same pipeline for all" — monitor sessions now enter the core ACP role pipeline rather than a separate simple launcher (shared source requirement 5).
3. "Full role grants for all" — these sessions use the role's command grants and the same command tool loop as `ask` and `tell`, with no persona-specific tool mode (shared source requirement 6).
4. "Persona names a role" — editor `>` requests keep naming a persona, and that persona's declared role configures the session (source requirement 7).
5. "Persona sessions get one session slot per role name on the tab, so two personas declaring different custom roles on one tab get separate sessions." (shared source requirement 16)
6. "Editor UI, ask/tell, roles format stay unchanged: the editor `>` request line and hunk results, the `ask` and `tell` commands, and the roles file format are not changed." (source requirement 15)
7. "A role that grants no commands leaves the session tool-less." (edge case from source Design decisions)
8. "Keep the persona's body as the session's startup prompt." (edge case from source Implementation steps)
9. "reuse the editor's existing keyed-session ownership and its connection, close, and death-handling behavior so its hunk parsing and incremental priming still work." (edge case from source Implementation steps)

## Design decisions

- Delete the persona-specific launcher rather than leaving it as a second path. `spawnMonitorSession` at `src/monitor/acp.ts:17` (quoted `export function spawnMonitorSession`) is the single place that builds a subprocess from `persona.harness` and `persona.tools`; its injection into `MonitorManager` at `src/monitor/manager.ts:30` (quoted `spawn: typeof spawnMonitorSession = spawnMonitorSession`) and into `createMonitorSession`, `openMonitorSession`, and `respawnMonitorSession` at `src/monitor/session.ts:16`, `src/monitor/session.ts:45`, and `src/monitor/session.ts:51` all move onto the subplan 2 entry. Removing a path that the system no longer takes is part of finishing the migration.
- Generalize `EditorAcpManager` at `src/editor/acp-manager.ts:18` (quoted `export class EditorAcpManager`) into the persona-session owner described in subplan 2: one owner per role-backed session, its state on the tab runtime, and its connection, close, death, and transcript behavior unchanged. Keep `managers.editorAcp` at `src/managers.ts:65` (quoted `editorAcp: EditorAcpManager;`) as the access point so `connectionsFor` at `src/editor/acp-manager.ts:84` and the close flows at `src/editor/acp-manager.ts:94` and `src/editor/acp-manager.ts:103` keep their callers. Switch the key from `${label}:${persona}` at `src/editor/acp-manager.ts:11` (quoted `const key = (label: string, persona: string): string`) to `${label}:${role}`, one slot per tab and resolved role name, while connection rows keep naming the persona the user typed.
- In `src/editor-suggest/handler.ts`, keep `ownerLabel` at line 14, the persona-name match at line 36, the unknown-persona notification at line 38, `isFirstTurn` at line 45, the priming text at line 72, `HUNK_FORMAT` and `parseHunks` at line 6, and the failure-notification logic at lines 52 to 63. Replace only the raw `session.prompt` at line 77 with the subplan 2 core entry, passing the persona body, the hunk format, and the buffer block as the first-turn prompt and just the buffer block and request on later turns. A refusal or a notification-only configuration failure resolves the callback with no hunks and adds no second notification.
- In `src/monitor/session.ts`, keep `primeMonitorSession` at line 31 with its persona body, `SUGGESTION_FORMAT`, and `TRUST_FRAMING_INSTRUCTIONS` at line 33, and keep the in-flight flag, the connection-info line at lines 17 to 27, and the respawn behavior at line 51. Replace only the spawn and raw prompt with the same core entry, keeping the persona body as the startup prompt.
- A role that grants no commands produces the no-tools primer from `src/acp/run-prompt.ts:60`; no editor- or monitor-specific tool mode is introduced, and the old `allowedTools` mechanism at `src/monitor/acp.ts:22` (quoted `allowedTools: persona.tools`) disappears with the launcher.
- Unknown-role and no-enabled-model failures are already notification-only in subplan 2. The editor handler's own `editor-suggest` notification stays for an unknown persona, a connect or prompt error, and an empty reply (`product/specs/notifications.md:161`), but must not duplicate the persona-config notification.

## Assumptions

1. Monitor sessions and editor persona sessions currently share one launcher — `src/monitor/acp.ts:17` (`spawnMonitorSession`) and `src/editor/acp-manager.ts:41` (quoted `spawnMonitorSession(persona, cwd`), which passes the hooks as its third argument.
2. The core role pipeline is available from subplan 2 and accepts arbitrary role names — `product/plans/ready/persona-role-acp-pipeline-2-core-role-session-pipeline.md`.
3. Every bundled persona now declares `ask` from subplan 1, so a role-configured session still primes with a real startup prompt — `ai/personas/editor/assistant.md` and `ai/personas/monitor/*.md`.
4. The editor's session owner already implements connection, death, close, and transcript behavior worth reusing — `src/editor/acp-manager.ts:55` (`died`), `src/editor/acp-manager.ts:94` (`close`), and `src/editor/acp-manager.ts:79` (`transcript`).
5. Editor suggestions parse hunks from the reply and apply them inline — `src/editor-suggest/handler.ts:6` (quoted `HUNK_FORMAT, parseHunks`) and `src/editor-suggest/reply-format.ts`.
6. Editor persona connections are live-only rows in the connections window — `product/specs/connections-tab.md:11` and `product/specs/editor-tab.md:742`.
7. The `ask`/`tell` commands and roles file format are outside this change — source requirement 15 and `product/specs/acp.md:18`.

## Existing functionality

1. The core ACP role entry with model fallback and grants from subplan 2 — `src/acp/manager.ts:74` (`run`) and `src/acp/run-prompt.ts:110` (`runCorePrompt`).
2. The editor's persistent keyed-session owner — `src/editor/acp-manager.ts:18` (`EditorAcpManager`).
3. The editor's incremental priming rule — `src/editor-suggest/handler.ts:45` (`isFirstTurn`) and `src/editor-suggest/handler.ts:72` (`primingText`).
4. The hunk reply format and parser — `src/editor-suggest/reply-format.ts` (`HUNK_FORMAT`, `parseHunks`).
5. The monitor's trust framing and suggestion format — `src/monitor/framing.ts` (`TRUST_FRAMING_INSTRUCTIONS`) and `src/monitor/reply-format.ts` (`SUGGESTION_FORMAT`).
6. The notification paths for editor failures — `src/editor-suggest/handler.ts:38` and `src/notifications/index.ts:194` (`notify`).
7. The connection rows that expose persona sessions — `src/editor/acp-manager.ts:84` (`connectionsFor`) and `src/monitor/info.ts` (`monitorConnections`).

## Implementation steps

First generalize the editor's session owner into the role-keyed persona-session manager from subplan 2, keeping its public surface (`hasSession`, `session`, `record`, `transcript`, `connectionsFor`, `close`, `closeTab`, `dispose`) so the existing callers and connection UI keep working. Re-key its slots by the resolved role name and make `connectionsFor` continue to label a row with the persona name; when two personas declare different custom roles on the same tab, the two role slots keep separate sessions and separate recorded exchanges.

Then rewrite the editor suggestion handler to obtain its prompt result through the core role entry instead of calling `session.prompt`, while preserving first-turn priming with the persona body and hunk format, later-turn prompts with only the buffer block and request text, the recorded input and response blocks, hunk parsing, and the existing failure notifications. A notification-only role failure resolves with no hunks and no answer line; the session itself is not killed on a prompt error, and an agent death is still reported once.

Next rewrite the monitor session functions to enter the same core entry. Keep the persona body, suggestion format, and trust framing as the startup prompt, the in-flight flag and its clearing on end or error, the connection-info transcript line, and the respawn path that resets context. Remove `spawnMonitorSession` and its function-injection parameters from `src/monitor/acp.ts`, `src/monitor/session.ts`, `src/monitor/live-monitors.ts`, and `src/monitor/manager.ts`, leaving no persona-specific launcher behind.

Update `product/specs/monitoring.md` and `product/specs/editor-tab.md` so their persona file format and session-launch descriptions match the role-backed path, including that a monitor and an editor session now use the role's grants rather than a persona tool allowlist. Add and update the colocated tests named below. No implementation code goes into this plan.

## UI design

1. The editor `>` request line, its completion, the pending-review panel, and the applied hunk results are unchanged (source requirement 15).
2. The editor connections window keeps showing one live row per open persona session, now backed by a role-configured core ACP connection; its close control and transcript snapshot button behave as before (`product/specs/editor-tab.md:748`).
3. Monitor reporting tabs and their metadata, reset, and context buttons are unchanged; the monitor connection-info line now reports the role-configured model.

## Tests

1. Source requirement 3, in `src/editor-suggest/handler.test.ts` and `src/acp/run-prompt.test.ts`: an editor suggestion reaches the core role entry with the persona's declared role and returns parsed hunks, and no raw `AcpSession.prompt` call remains in the handler.
2. Source requirement 7, in `src/editor-suggest/handler.test.ts`: the first request in a tab primes with persona body and hunk format, a later request sends only buffer and request text, and hunk parsing and failure notifications still work.
3. Source requirement 4, in `src/editor-suggest/handler.test.ts`: the `>` request still names a persona, and that persona's declared role is what the session uses.
4. Source requirement 2, in `src/monitor/session.test.ts`: monitor sessions enter the core role entry, keep the persona body as startup prompt, and preserve in-flight, connection info, and respawn behavior.
5. Source requirements 16 and 6, in `src/editor/acp-manager.test.ts`: two personas with different custom roles on one tab hold two separate sessions with their own settings, close and death handling stay scoped to a slot, and a role with no grants yields no tool table.
6. Source requirements 9 and 10 from subplan 2, in the session tests: an unknown role or a role with no enabled models produces only the exact notification and no hunk or answer line.
7. Source requirement 15: no test changes the editor request line, hunk format, `ask`/`tell` commands, or roles file format.

## Out of scope

The launcher summarizer's role wiring, which is subplan 4. Any change to the `ask` and `tell` commands, the editor `>` request line, the hunk result format, the roles file format, the notifications feed implementation, or any client surface. No new protocol message or RPC.

## Verification

Run `$janissary/scripts/run.mjs check-diff` for the changed server modules, specs, and tests. Manual check against the running app: set an editor persona's first line to `[//]: # role: research` where `research` is a custom role with a distinct enabled model, open an editor tab, issue a `>` suggestion with that persona, and confirm the suggestion arrives from that model, the connections window shows the persona session as a role-backed ACP connection, and a second persona declaring a different custom role on the same tab opens a second session. Change the first line to a missing role and confirm the exact unknown-role notification with no answer in the editor.
