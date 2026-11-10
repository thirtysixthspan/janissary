# Record denied permission requests as connection activity

**Complexity: 2/10** — ~5 added lines in one production file (`src/acp/index.ts` `requestPermission`), 4 requirements, 4 test scenarios folded into existing `index.test.ts` cases, no new units (p=3.99).

## Goal

Layer two of the internal-tool policy in `product/plans/complete/deny-internal-tools-for-role-acp-connections.md` is the existing permission-request denial in `connectAcp`. Today that denial is silent: an `ask` or `tell` agent that asks to use a built-in tool is refused and nothing records it. After this subplan the refusal is written to the connection record's activity as a `permission` entry naming the refused tool call, the same way autonomous decisions already are.

## Design decisions and dependencies

Builds on nothing earlier; it is independent of subplan 1 (already implemented on this branch) and touches none of its files. It is numbered second so the layer-two wording in `product/specs/acp.md` exists before subplan 4 adds layer one beside it. Subplan 3 also edits `src/acp/index.ts` (`ensureSession`), in a different function; the two land in either order without conflict.

- "Internal tools" means the tools the harness itself provides to the model — shell, file read/write/edit, search, web fetch and search, sub-agents — not Janissary native commands, which run through the existing tool loop.
- Two layers. Layer one (subplan 4) disables the harness's built-in tools at launch so they are never offered to the model. Layer two is the existing permission-request denial in `connectAcp` (`requestPermission` in `src/acp/index.ts`, `decidePermission` in `src/acp/tools.ts`), kept as is. This subplan only makes layer two visible; it does not change any decision.
- The record keys off the outcome, not off the caller: on the non-autonomous path, whenever `decidePermission` returns `{ outcome: 'cancelled' }` — an undefined or empty `allowedTools`, or an allowlist that does not include the classified tool — `connectAcp` records the denial through `onActivity` as the same `permission_decision` update the autonomous branch already emits at `src/acp/index.ts:105` (`options.onActivity?.({ sessionUpdate: 'permission_decision', toolCall: params.toolCall, outcome })`). The record is emitted before the reply is returned to the agent.
- What the entry says: `acpActivity` (`src/acp/activity.ts`) finds no `content` on a `permission_decision` update and uses the whole update's JSON as the text, so the entry carries the full `toolCall` (its `toolCallId`, `title`, `kind`, and whatever else the adapter sent) and `{"outcome":"cancelled"}`. The connection tab renders a JSON-object entry as indented JSON (`product/specs/connections-tab.md`). No new text format is added.
- Only sessions that pass `onActivity` record it. Callers of `connectAcp` today: `src/acp/session-manager.ts` (local role sessions — records), `src/remote/serve-acp.ts` (remote-hosted role sessions and remote agent runs — relays), `src/agent/execute.ts` (agent runs, always `autonomous: true`, so the new path never runs there), `src/monitor/acp.ts` and `src/conversations/sessions.ts` (pass no `onActivity`; unaffected). A monitor's denied non-allowlisted tool therefore still records nothing.
- The autonomous branch is unchanged. The early guard at the top of `requestPermission` (`if (killed || !control.current || control.current.cancelled) return { outcome: { outcome: 'cancelled' } }`) is shared by both branches and also unchanged: it is cancellation bookkeeping, not a policy denial, and records nothing, exactly as the autonomous branch records nothing there today. The spec's "Native permission requests after cancellation are denied as cancelled." stays true as written.
- A request `decidePermission` approves (a monitor's opted-in web tool) is not a denial and records nothing; monitors pass no `onActivity` anyway.
- A remote-hosted role session needs no protocol change: `src/remote/serve-acp.ts` `open` already classifies every `onActivity` update with `acpActivity` and sends it as an `acp-activity` frame, and `src/remote/acp-session.ts` hands it to `AcpSessionManager`'s `activity` sink. Because `connectAcp` runs on the remote host, a remote session records denials only once the remote host's Janissary includes this change; the local side needs nothing.
- No opt-out in this version.
- File size: `src/acp/index.ts` has 184 raw lines and 155 lines as `max-lines` counts them (blanks and comments skipped; checked with a lowered `max-lines` rule), so this change plus subplan 3's one-line `_meta` addition stays well under 200. Do not extract a module for this subplan. Only if `lint-files` reports `max-lines` on `src/acp/index.ts` (it should not), move the `requestPermission` body into a new `src/acp/permission-handler.ts` taking `options` and the `AcpPromptControl` instance, rather than compacting.

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| Permission-request denial | `src/acp/index.ts` `requestPermission`, `src/acp/tools.ts` `decidePermission` | Layer two; gains the denial activity record. `decidePermission` is unchanged. |
| Autonomous decision record | `src/acp/index.ts:105` `options.onActivity?.({ sessionUpdate: 'permission_decision', … })` | The exact update shape and call to emit for a denial. |
| Permission activity kind | `src/acp/activity.ts` `acpActivity` | Already classifies `permission_decision` updates as `permission`; its text is the update's JSON. Already covered by `src/acp/activity.test.ts` (`['permission_decision', 'permission']` and the JSON-fallback case) — no change. |
| Local role-session activity sink | `src/acp/session-manager.ts` `session` (`onActivity` → `acpActivity` → `activity` → `coreActivity` in `src/acp/record-feed.ts`) | Writes the entry to the connection record with no change. `src/acp/record-feed.test.ts` "captures the first reserved prompt and five activity kinds" already proves a `permission_decision` update lands as a `permission` entry, local and remote. |
| Remote activity relay | `src/remote/serve-acp.ts` `open` (`onActivity` → `acp-activity` frame) → `src/remote/acp-session.ts` `onActivity` | Carries the entry for a remote-hosted role session with no change. |
| Permission mock agent | `src/acp/index.test.ts` `permission` mode (a `WebFetch` request, `kind: 'fetch'`, one `allow_once` option `once`), `connect(mode, allowedTools, autonomous, effort, onActivity)` helper | Drives the test cases. |

## Proposed changes

- `src/acp/index.ts` `requestPermission`: after the autonomous branch, compute `const outcome = decidePermission(options.allowedTools, params.toolCall, params.options)`; when `outcome.outcome === 'cancelled'`, call `options.onActivity?.({ sessionUpdate: 'permission_decision', toolCall: params.toolCall, outcome })` before returning `{ outcome }`. Leave the early guard and the autonomous branch byte-for-byte unchanged.
- Update the two comments that describe this behavior: the one-line comment directly above `requestPermission` ("Deny every tool request unless the persona's allowlist opts a classified web tool in.") and the "Tool permission requests are denied unless…" sentence in the `connectAcp` doc comment, each gaining that a denied request is recorded through `onActivity`.

## Tests

All in `src/acp/index.test.ts`, `describe` block holding the existing permission cases. Pass an `onActivity` collector through the `connect` helper's fifth parameter and filter the collected updates to `sessionUpdate === 'permission_decision'` (the mock's reply chunk also reaches `onActivity` as an `agent_message_chunk`). The record is emitted before the reply is sent, so assert after `prompt` resolves with no extra wait.

- Extend "denies a tool permission request when no tools are allowed": with no `allowedTools`, exactly one `permission_decision` update, whose `toolCall` equals the mock's call (`{ toolCallId: 'tool-1', title: 'WebFetch', kind: 'fetch' }`) and whose `outcome` equals `{ outcome: 'cancelled' }`; the reply still reads `outcome={"outcome":"cancelled"}`.
- New case: an allowlist that excludes the classified tool (`allowedTools: ['web_search']` against the `WebFetch` request) is also denied and emits exactly one `permission_decision` update with `outcome` `{ outcome: 'cancelled' }`. This pins that the record keys off the outcome, not off an empty allowlist.
- Extend "selects the allowed option for a permitted web tool": the `['web_fetch']` approval still replies `outcome={"outcome":"selected","optionId":"once"}` and emits no `permission_decision` update.
- Extend "approves provider permissions only for an explicitly autonomous connection": still replies `outcome={"outcome":"selected","optionId":"once"}` and emits exactly one `permission_decision` update (the existing autonomous record, not a duplicate).
- The early cancellation guard is not tested here: it needs a permission request racing a cancel, it is unchanged, and it records nothing before or after.
- `src/acp/activity.test.ts`, `src/acp/record-feed.test.ts`, and `src/remote/serve-acp.test.ts` need no change (see the reuse table).

## Spec and docs updates

- `product/specs/acp.md`, the last paragraph of `### Model fallback` under `## Provider and model` (it begins "The session's configured provider/model appears in its connection row after the handshake."): replace its second sentence, "The shared ACP transport still denies native permission requests except where a separate consumer explicitly supplies its own allowlist.", with the layer-two policy — the shared transport denies every permission request a role session's agent raises (only a separate consumer's own allowlist, such as a monitor's web tools, or an autonomous run approves one) — and the denial activity entry: a denied request on an `ask` or `tell` session appears in its connection record as a `permission` activity entry carrying the refused tool call; a request refused because its prompt was cancelled or the session closed records nothing. Keep the first sentence. Subplan 4 extends this same paragraph with layer one, completing the two-layer policy.
- No other spec changes: `product/specs/acp-records.md` and `product/specs/connections-tab.md` already list `permission` as a recorded and rendered kind.

## Verification

`$janissary/scripts/run.mjs check-diff` green.

Manually, on a local shell tab: put a claude entry first in the `ask` role (its built-in tools are still on until subplan 4, and the bundled `claude-agent-acp` adapter raises `session/request_permission` before a shell command or a file write in its default mode), `ask reset`, then run `ask create a file named probe.txt in this directory using your shell`. In that role's connection tab, confirm the prompt block holds a `permission` entry whose JSON shows the refused tool call (its `title`) and `"outcome":"cancelled"`, alongside the adapter's own `tool` entry for the same call, and that no `probe.txt` was created.

## Out of scope

- Turning built-in tools off at launch (subplan 4).
- Recording or changing monitor, conversation, editor persona, or autonomous run permission decisions beyond what they do today.
- Recording requests refused by the early cancellation guard.
- A user-visible warning or notification for a denial; the record entry is the only surface.
- Any change to `acpActivity`'s text for permission entries (for example a friendlier one-line summary).
