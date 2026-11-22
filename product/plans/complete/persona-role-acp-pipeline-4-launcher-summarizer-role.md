# Launcher summarizer runs under its declared role

**Complexity: 5/10** — ~35 added production lines across 6 edited plugin and capability files, 6 requirements and 8 scenarios (p=5.374)

## Goal

Make the launcher summarizer's declared role configure the launcher tab's core ACP connection, so its models come from that role, while keeping the tab's `withoutTools: true` mode. The launcher plugin's independent persona reader learns the new directive without importing host internals, and the plugin ACP capability gains an additive way to name the role.

Dependencies: the source plan `product/plans/complete/persona-role-acp-pipeline.md`, `product/plans/ready/persona-role-acp-pipeline-1-persona-role-format.md`, and `product/plans/ready/persona-role-acp-pipeline-2-core-role-session-pipeline.md`.

## Requirements

1. "The launcher summarizer's declared role configures the launcher tab's ACP session, so the summarizer runs under that role's models." (source requirement 17)
2. "Same pipeline for all" — the summarizer's session runs through the core ACP role pipeline from subplan 2 (shared source requirement 5).
3. "Full role grants for all" with the documented exception that the summarizer's `withoutTools: true` mode still applies, so it cannot run commands (shared source requirement 6 and source Design decisions edge case).
4. "All three families" — the launcher persona declares a role and keeps no old directive (shared source requirement 4).
5. "A persona file without a valid `role:` directive fails to load ... with the exact error `Persona \"<name>\": expected first line [//]: # role: <role>.`" (shared source requirement 11), enforced by the launcher's own reader.
6. "An old `[//]: # tools: ...` line left in a persona file is treated as ordinary prompt body text, with no error." (shared source requirement 12), enforced by the launcher's own reader.

## Design decisions

- `readPersonaBody` at `src/plugins/launcher/persona.ts:23` (quoted `export function readPersonaBody`) cannot import `src/personas.ts`, because a concrete plugin may not reach host internals (`ai/guidelines/plugins.md` section 1 and `ai/guidelines/plugins-tabs.md` "Import boundaries"). It must accept the new first-line directive independently: require `[//]: # role: `, throw the exact load error for a missing or malformed directive, and return only the body. The project file at `ai/personas/launcher/summarizer.md` and the shipped fallback at `SHIPPED_PERSONA` in `src/plugins/launcher/persona.ts:8` both use the new format from subplan 1.
- A leftover `tools:` line needs no special handling in this reader either; it is part of the returned body, matching source requirement 12.
- Extend the plugin ACP capability additively. `startAcp` in `src/plugins/api.ts:238` (quoted `startAcp(request?: { withoutTools?: true }):`) gains an optional role name, and `promptAcpResult` in `src/plugins/api.ts:245` stops hardcoding `ask` in the host implementation `src/plugins/acp-capabilities.ts:32` (quoted ``managers.acp.promptResult(label, `ask ${prompt}`)``). Make `startAcp` record the supplied role on the launcher tab's role slot from subplan 2 and have `promptAcpResult` read that same slot instead of prepending `ask`, so the role used for the connection and the role used for the prompt cannot diverge. Adding an optional request field is a compatible extension of the host contract, not a new capability (`ai/guidelines/plugins.md` section 4).
- `summarizeOnce` at `src/plugins/launcher/summarizer.ts:186` (quoted `export async function summarizeOnce`) passes the declared role into `startAcp` at line 206 while keeping `{ withoutTools: true }` exactly as it is today, so the summarizer still cannot run a command. Its session-identity check and re-priming on replacement at line 211 stay unchanged.
- Unknown-role and no-enabled-model failures already notify without a reply in subplan 2. The summarize intent's catch at `src/plugins/launcher/activate.ts:249` (quoted `} catch (error) {`) must not emit a second notification for those two cases; it keeps reporting genuine prompt failures and start refusals as it does now.
- The roles file format, `ask` and `tell`, and the launcher's own reply shape and trust framing are unchanged; only the connection's role and the reader's directive change.

## Assumptions

1. The launcher summarizer already runs on the launcher tab's core ACP connection rather than a persona-spawned subprocess — `src/plugins/launcher/persona.ts:19` (quoted `Only the body is used`) and `product/specs/launcher.md:62` (quoted `The summarizer is an ACP session the launcher's own tab runs`).
2. The summarizer requests a tool-less session — `src/plugins/launcher/summarizer.ts:206` (quoted `capabilities.startAcp({ withoutTools: true })`) and `product/specs/acp.md:9` (quoted `startAcp({ withoutTools: true })`).
3. A concrete plugin cannot import host internals — `ai/guidelines/plugins.md` section 1 and `ai/guidelines/plugins-tabs.md` "Import boundaries and versioning".
4. The core role entry accepting arbitrary role names comes from subplan 2 — `product/plans/ready/persona-role-acp-pipeline-2-core-role-session-pipeline.md`.
5. The launcher persona is bundled with the application and now declares `ask` from subplan 1 — `ai/personas/launcher/summarizer.md`.
6. The host builds plugin ACP capabilities in one place — `src/plugins/acp-capabilities.ts:8` (quoted `export function acpCapabilities`) and `src/plugins/api-capabilities.ts:106` (`startAcp: true`).

## Existing functionality

1. The launcher's independent persona reader and shipped fallback — `src/plugins/launcher/persona.ts:23` (`readPersonaBody`) and `src/plugins/launcher/persona.ts:8` (`SHIPPED_PERSONA`).
2. The tool-less core ACP session request — `src/plugins/launcher/summarizer.ts:206` and `src/plugins/acp-capabilities.ts:24` (quoted `startAcp: (request) => managers.acp.start(ownLabel(), request)`).
3. The summarizer's priming, session identity, and re-priming behavior — `src/plugins/launcher/summarizer.ts:134` (`primingText`) and `src/plugins/launcher/summarizer.ts:211` (quoted `state.session !== started.session`).
4. The summarize intent that drives a flush — `src/plugins/launcher/activate.ts:207` (quoted `summarize: {`) and `src/plugins/launcher/activate.ts:215` (quoted `personaBody: readPersonaBody`).
5. The core role prompt entry from subplan 2 — `src/acp/manager.ts:67` (`promptResult`) and `src/acp/ask-role.ts:67` (`knownRoleSettings`).
6. The plugin capability contract and its frozen shape checks — `src/plugins/api.ts:238` (`startAcp`) and `src/acp/plugin-session.test.ts`.

## Implementation steps

Change `readPersonaBody` to parse the new first-line role directive, throw the exact host-compatible load error when it is missing or malformed, and return the remaining lines as the body; a leftover tools line stays in the body. Update `src/plugins/launcher/persona.test.ts` to cover the shipped fallback, a project persona declaring a role, the exact error, and the body-text treatment of a leftover tools line.

Extend `startAcp` with an optional role name in the plugin contract, pass it through `acpCapabilities` into the core entry from subplan 2, and make `promptAcpResult` use the role established on that tab instead of prepending `ask`. Keep `withoutTools` handling exactly as it is, including the tab-scoped rule that it holds for every prompt until the tab closes.

Change `summarizeOnce` to read the declared role alongside the persona body and pass it into `startAcp` together with `{ withoutTools: true }`. Update `activate.ts` so the summarize intent supplies both values to `summarizeOnce`, and so a role configuration failure is reported only by the subplan 2 notification. Keep the delimiter, reply format, tab framing, cursor rules, and the session-replacement re-prime unchanged.

Update `product/specs/launcher.md` and the Core ACP paragraph of `ai/guidelines/plugins-tabs.md` so they state that the summarizer's declared role configures its connection and that the session remains tool-less. Add and update the colocated tests named below. No implementation code goes into this plan.

## UI design

1. No new view or control. The launcher rail's summary rows and their hover expansion are unchanged.
2. The only observable differences are which model's summaries appear, that the launcher tab's ACP connection reports the declared role's model, and a notification line when the declared role is unknown or has no enabled models.

## Tests

1. Source requirement 4, in `src/plugins/launcher/persona.test.ts`: a project persona with `[//]: # role: <name>` yields its body and the shipped fallback persona also satisfies the role directive.
2. Source requirements 11 and 12, in `src/plugins/launcher/persona.test.ts`: a missing or malformed first line throws `Persona "<name>": expected first line [//]: # role: <role>.`, and a leftover `tools:` line is returned as body text with no error.
3. Source requirement 17, in `src/plugins/launcher/summarizer.test.ts`: the declared role is passed into `startAcp` and the resulting connection's model is that role's model; `promptAcpResult` no longer hardcodes `ask`.
4. Source requirement 6 edge case, in `src/plugins/launcher/summarizer.test.ts`: the start request still carries `{ withoutTools: true }`, and priming and re-priming on session replacement still work unchanged.
5. Source requirements 9 and 10 from subplan 2: an unknown role or a role with no enabled models yields only the exact notification, no answer line, and no second notification from the summarize intent's catch.
6. The plugin capability shape tests in `src/acp/plugin-session.test.ts` and the launcher activation tests in `src/plugins/launcher/activate.test.ts` still pass with the additive optional role field.

## Out of scope

Changing monitor or editor sessions, which is subplan 3. Changing the launcher's reply format, trust framing, cursors, or client rendering. Changing the roles file format, the `ask` and `tell` commands, or any notification event type. No new plugin capability declaration is added beyond the optional field on `startAcp`.

## Verification

Run `$janissary/scripts/run.mjs check-diff` for the changed plugin, capability, spec, and test files. Manual check against the running app: define a custom role with one distinct enabled model, set the project's `ai/personas/launcher/summarizer.md` first line to `[//]: # role: <that role>`, open the launcher and let a flush run, and confirm the rail's summaries come from that model and the launcher's connection reports the role-backed model. Confirm the summarizer still cannot run commands, and change the first line to a missing role to see the exact unknown-role notification with no summary produced.
