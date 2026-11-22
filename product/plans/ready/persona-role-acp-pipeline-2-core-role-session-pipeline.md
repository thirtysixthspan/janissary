# Core ACP pipeline resolves persona roles and owns per-role sessions

**Complexity: 5/10** — ~60 added production lines across 6 edited core files, 7 requirements and 8 scenarios (p=5.600)

## Goal

Give every persona-declared role, built-in or custom, a single core ACP entry that resolves it against the effective roles file and starts a session with that role's model entries, fallback, command grants, and tool loop. Add per-tab session slots keyed by role name and make configuration failures notification-only. No consumer is migrated here; this is the shared pipeline that subplans 3 and 4 call.

Dependencies: the source plan `product/plans/complete/persona-role-acp-pipeline.md` and `product/plans/ready/persona-role-acp-pipeline-1-persona-role-format.md`.

## Requirements

1. "When the persona is used, the role must be used in the acp connection." (source requirement 2)
2. "Same pipeline for all" — at this layer the core entry accepts an arbitrary role name; monitor and launcher consumers adopt it in subplans 3 and 4 (shared source requirement 5).
3. "Full role grants for all" — a persona session uses its role's command grants and the same command tool loop as `ask` and `tell`, with no persona-specific tool mode (shared source requirement 6).
4. "An unknown role starts no session and produces no reply line; the only signal is the notification `Persona \"<persona>\" requests unknown role \"<role>\".`" (source requirement 9)
5. "A role with no enabled model entries starts no session and produces no reply line; the only signal is the notification `Persona \"<persona>\" finds no enabled models in role \"<role>\".`" (source requirement 10)
6. "A persona may declare any role name that resolves through the effective roles file, including a custom role." (shared source requirement 14)
7. "Persona sessions get one session slot per role name on the tab, so two personas declaring different custom roles on one tab get separate sessions." (source requirement 16)
8. "A role that grants no commands leaves the session tool-less." (edge case from source Design decisions)
9. "Persona configuration failures are notifications, not request replies." (edge case from source Design decisions)
10. "The `ask` and `tell` commands and the roles file format are not changed." (source requirement 15 boundary, shared with subplan 5)

## Design decisions

- Resolve a declared role with `knownRoleSettings` at `src/acp/ask-role.ts:67` (quoted `export function knownRoleSettings`), or `readRoleSettings` at `src/acp/ask-role.ts:61` once the name is known. `knownRoleSettings` returns undefined when neither the effective file nor the built-in defaults hold the name, which is the unknown-role case; name matching is trimmed and case-insensitive through `findRole` at `src/acp/ask-role.ts:23` (quoted `function findRole`).
- Generalize the core entry so a role is a name string rather than only `AcpRole`: `AcpManager.promptResult` at `src/acp/manager.ts:67` (quoted `async promptResult`) and `run` at `src/acp/manager.ts:74` accept an arbitrary resolved role name, read that role's entries and grants through the settings reader injected at `src/acp/manager.ts:27` (quoted `private readonly roleSettings`), and drive the same `runCorePrompt` at `src/acp/run-prompt.ts:110` (quoted `export function runCorePrompt`) and model queue at `src/acp/manager.ts:176` (quoted `private queueFor`). `runAcpCommand` at `src/acp/response.ts:51` (quoted `export function runAcpCommand`) stays the `ask`/`tell` adapter and keeps its transcript receipts, so source requirement 15 holds.
- A role with no launchable entries is detected with the same catalog filter `queueFor` already uses, and produces the no-enabled-models notification rather than an `ACP: the <role> role lists no models.` reply line; an unknown role produces the unknown-role notification. Neither path calls `appendAcp` at `src/acp/response.ts:17` nor `appendAcpBackgroundReply` at `src/acp/response.ts:39`, so no answer or reply line is written.
- Both failures go through `notify` at `src/notifications/index.ts:194` (quoted `export function notify`) with the existing `manual` event. That event's body is the caller's text verbatim (`src/notifications/format.ts:56`, quoted `case 'manual'`), it bypasses focus suppression and has no toggle (source `product/specs/notifications.md:371`), so the two exact strings in requirements 4 and 5 survive unchanged. No new notification event type or spec entry is introduced.
- Persona sessions get their own per-tab slot keyed by the resolved role name, not a slot in `AcpRole`. `AcpRoleRuntime` at `src/acp/role-state.ts:6` and the `acpRoles` field at `src/tab/types.ts:300` (quoted `acpRoles?: Partial<Record<AcpRole, AcpRoleRuntime>>`) remain the `ask`/`tell` state; a sibling role-keyed record is added to `TabRuntime` at `src/tab/types.ts:292` (quoted `export type TabRuntime = {`) and owned by a managing service, following the rule that per-agent state lives on the tab record rather than a new map on the controller. Key each slot by the tab label and the resolved role name, so one tab holds at most one persona session for a given role while two roles on that tab get two distinct slots.
- The managing service reuses the connection, close, death, and transcript behavior of `EditorAcpManager` at `src/editor/acp-manager.ts:36` (`session`), `src/editor/acp-manager.ts:55` (`private died`), `src/editor/acp-manager.ts:63` (`private forget`), `src/editor/acp-manager.ts:73` (`record`), `src/editor/acp-manager.ts:94` (`close`), and `src/editor/acp-manager.ts:111` (`dispose`) rather than building a second ownership pattern. Subplan 3 generalizes that manager to this service.
- A role whose grants are empty builds no tool table: `corePromptPrimer` at `src/acp/run-prompt.ts:60` (quoted `export function corePromptPrimer`) already produces the no-tools primer when the snapshot has no grants, so no persona-specific tool mode is added.

## Assumptions

1. Role settings, including arbitrary names, are read fresh per prompt with built-in fallbacks — `product/specs/acp.md:29` (quoted `The \`ask\` role's model entries and native-command grants come from the roles file in effect`) and `product/specs/roles.md:223` (quoted `The core ACP sessions behind \`ask\` and \`tell\` read roles`).
2. Role names resolve by trimmed, case-insensitive comparison and report the file's spelling — `product/specs/roles.md:236` (quoted `A role name is matched ignoring surrounding whitespace and case`) and `src/acp/ask-role.ts:23` (`findRole`).
3. `knownRoleSettings` distinguishes a known role from an unknown one — `src/acp/ask-role.ts:67` (quoted `export function knownRoleSettings`) returning undefined when `known` is false.
4. The core role session's model queue filters out models absent from the catalog — `src/acp/manager.ts:176` (`queueFor`) and `src/acp/manager.ts:179` (quoted `this.managers.models.isKnownModel`).
5. Role connections deny every harness internal tool — `product/specs/acp.md:41` (quoted `Role connections deny every internal tool in two layers`) and `product/specs/roles.md:231` (quoted `Role connections deny all of their harness's internal tools`).
6. `AcpManager` is keyed by the two built-in roles today — `src/acp/manager.ts:27` (`roleSettings` typed by `AcpRole`) and `src/acp/role.ts:1` (quoted `export const ACP_ROLES = ['ask', 'tell'] as const`).
7. A prompt result distinguishes an answer from a refusal — `src/acp/types.ts:29` (quoted `export type AcpPromptResult =`), so a caller can treat a notification-only failure as a failure without parsing prose.

## Existing functionality

1. Role settings resolution by arbitrary name — `src/acp/ask-role.ts:61` (`readRoleSettings`) and `src/acp/ask-role.ts:67` (`knownRoleSettings`).
2. The core prompt entry with model fallback and the autonomous command loop — `src/acp/manager.ts:74` (`run`) and `src/acp/run-prompt.ts:110` (`runCorePrompt`).
3. The no-tools primer for a grant-less role — `src/acp/run-prompt.ts:60` (`corePromptPrimer`) and `src/acp/run-prompt.ts:64` (quoted `snapshot.withoutTools ? [] : createAcpToolTable(snapshot.grants)`).
4. Per-role runtime state on the tab — `src/acp/role-state.ts:15` (`acpRoleRuntime`) and `src/tab/types.ts:300` (`acpRoles`).
5. The keyed-session ownership pattern to reuse — `src/editor/acp-manager.ts:18` (`export class EditorAcpManager`).
6. The notification helper used for explicit failures — `src/notifications/index.ts:194` (`notify`) and `src/notifications/format.ts:43` (`notificationText`).
7. The `ask`/`tell` adapters that must stay untouched — `src/commands/ask.ts:11` (quoted `runAcpCommand` passing `'ask'`) and `src/commands/tell.ts:11` (quoted `runAcpCommand` passing `'tell'`).

## Implementation steps

Introduce a persona-role prompt entry that takes a tab label, the user's prompt, a resolved role name, and the persona name, and returns an `AcpPromptResult`. It resolves settings through `knownRoleSettings`, and when that returns undefined calls `notify` with the exact unknown-role message and returns a refusal without touching the transcript. For a known role it asks `AcpManager` for the launchable entry queue; when that queue is empty it calls `notify` with the exact no-enabled-models message and likewise returns without a transcript line. Otherwise it runs the ordinary core prompt attempt with that role's entries and grants, so fallback, the deny-all internal-tool layers, and the command tool loop all apply.

Generalize `AcpManager.run` and `AcpManager.promptResult` to carry a role name string while keeping the current `AcpRole` default for existing callers, and keep `runAcpCommand` as the `ask`/`tell` adapter. Build the new per-tab, per-role slot on `TabRuntime`, keyed by tab label and role name, accessed only through a managing service that copies `EditorAcpManager`'s reuse, connection-error, death, record, close, and dispose behavior. Add that service to `Managers` beside `editorAcp: EditorAcpManager;` at `src/managers.ts:65`, and wire it into the existing tab-close and shutdown teardown paths so every acquired session has a matching release.

Do not migrate any caller yet. Add tests beside the changed core modules. No implementation code goes into this plan.

## UI design

1. No new or changed view in this subplan. The only user-visible effect of the two failure paths is a line in the notifications feed: `Persona "<persona>" requests unknown role "<role>".` or `Persona "<persona>" finds no enabled models in role "<role>".`

## Tests

1. Source requirement 2: a core persona-role prompt resolves the declared role, launches the role's configured model entry, and reports that model as the session identity.
2. Source requirements 5 and 6: a custom role resolves to its own entries and grants, and two different role names on one tab keep two separate session slots with their own settings.
3. Source requirements 6 and 8: the role's granted commands drive the tool loop, and a role with no grants produces the no-tools primer with no runnable command.
4. Source requirement 9: an unknown role produces exactly `Persona "<persona>" requests unknown role "<role>".` through `notify`, starts no session, and appends no transcript line or reply.
5. Source requirement 10: a known role whose entries are all disabled produces exactly `Persona "<persona>" finds no enabled models in role "<role>".`, starts no session, and appends no transcript line or reply.
6. Source requirement 15: `ask` and `tell` still enter through `runAcpCommand` and keep their existing reply receipts, with no change to the commands or roles file format.
7. Tests belong beside the changed modules, following the `src/**/*.test.ts` convention; add focused cases to `src/acp/run-prompt.test.ts` and a new colocated test file for the persona-role entry and session slots.

## Out of scope

Changing monitor sessions, editor suggestions, or the launcher summarizer — those consumers adopt this entry in subplans 3 and 4. Changing the editor `>` request line, hunk results, the `ask` and `tell` commands, the roles file format, or any client surface. Adding a new protocol message or RPC.

## Verification

Run `$janissary/scripts/run.mjs check-diff` for the changed core modules and tests. Manual check against a running app: with a roles file that defines a custom role with one distinct enabled model, invoke the new persona-role prompt entry from a scratch in-process harness for a known persona and confirm the connection row reports that role's model and the reply comes through the role's tool loop; then invoke it with an unknown role name and with a role whose only model is disabled, and confirm each case yields only its exact notification line, no new connection row, and no answer line in the tab transcript.
