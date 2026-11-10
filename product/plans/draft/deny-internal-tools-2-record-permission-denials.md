# Record denied permission requests as connection activity

**Complexity: 2/10** — A few lines in `connectAcp`'s `requestPermission` reusing the `permission_decision` update the autonomous branch already emits, one or two `index.test.ts` cases, and a spec sentence; the only risk is the 200-line limit on `src/acp/index.ts`.

## Goal

Layer two of the internal-tool policy in `product/plans/ready/deny-internal-tools-for-role-acp-connections.md` is the existing permission-request denial in `connectAcp`. Today that denial is silent: an `ask` or `tell` agent that asks to use a built-in tool is refused and nothing records it. After this subplan the refusal is written to the connection record's activity as a `permission` entry naming the refused tool, the same way autonomous decisions already are.

## Design decisions and dependencies

Builds on nothing earlier; it is independent of subplan 1 and can land in either order, but is numbered second so the layer-two wording in `product/specs/acp.md` exists before subplan 4 adds layer one beside it.

- "Internal tools" means the tools the harness itself provides to the model — shell, file read/write/edit, search, web fetch and search, sub-agents — not Janissary native commands, which run through the existing tool loop.
- Two layers. Layer one (subplan 4) disables the harness's built-in tools at launch so they are never offered to the model. Layer two is the existing permission-request denial in `connectAcp` (`requestPermission` in `src/acp/index.ts`, `decidePermission` in `src/acp/tools.ts`), kept as is. This subplan only makes layer two visible; it does not change any decision.
- When `connectAcp` denies a permission request on a non-autonomous session, it records the denial through `onActivity` as the same `permission_decision` update the autonomous branch already emits (`{ sessionUpdate: 'permission_decision', toolCall, outcome }`). The connection record's `permission` activity entry then names the refused tool.
- Only sessions that pass `onActivity` record it — role sessions and remote-hosted role sessions; monitors and conversations pass none and are unaffected.
- The autonomous branch is unchanged. The early guard at the top of `requestPermission` (a killed session, no current turn, or a cancelled turn answers `cancelled`) is shared by both branches and also unchanged: it is cancellation bookkeeping, not a policy denial, and records nothing, exactly as the autonomous branch records nothing there today.
- A request `decidePermission` approves (a monitor's opted-in web tool) is not a denial and records nothing; monitors pass no `onActivity` anyway.
- A remote-hosted role session needs no protocol change: `src/remote/serve-acp.ts` already classifies every `onActivity` update with `acpActivity` and sends it as an `acp-activity` frame, and `acpActivity` already maps `permission_decision` to the `permission` kind with the update's JSON as its text.
- No opt-out in this version.
- `src/acp/index.ts` has 184 raw lines and stays under the 200-line code limit (`max-lines` skips blanks and comments) with these few lines. If it does not — this subplan and subplan 3 both add lines — extract the permission handler (the `requestPermission` body, taking `options` and the prompt control) into its own module, e.g. `src/acp/permission-handler.ts`, rather than compacting.

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| Permission-request denial | `src/acp/index.ts` `requestPermission`, `src/acp/tools.ts` `decidePermission` | Layer two; gains the denial activity record. `decidePermission` is unchanged. |
| Autonomous decision record | `src/acp/index.ts` `requestPermission` autonomous branch | The exact update shape to emit for a denial. |
| Permission activity kind | `src/acp/activity.ts` `acpActivity` | Already classifies `permission_decision` updates as `permission`; its text is the update's JSON, as for autonomous decisions. |
| Local role-session activity sink | `src/acp/session-manager.ts` (`onActivity` → `acpActivity` → `coreActivity`) | Writes the entry to the connection record with no change. |
| Remote activity relay | `src/remote/serve-acp.ts` `open` (`onActivity` → `acp-activity` frame) | Carries the entry for a remote-hosted role session with no change. |
| Permission mock agent | `src/acp/index.test.ts` `permission` mode, `connect(..., onActivity)` helper | Drives the new test cases. |

## Proposed changes

- `src/acp/index.ts` `requestPermission`: after the autonomous branch, compute `const outcome = decidePermission(options.allowedTools, params.toolCall, params.options)`; when `outcome.outcome === 'cancelled'`, call `options.onActivity?.({ sessionUpdate: 'permission_decision', toolCall: params.toolCall, outcome })` before returning `{ outcome }`. Update the comment above `requestPermission` to say denials are recorded.
- If `npx eslint src/acp/index.ts` (or `lint-files`) reports `max-lines`, extract the handler as described in the design decisions.

## Tests

`src/acp/index.test.ts` (the `permission` mock-agent mode exists):

- A denied request on a non-autonomous session (no `allowedTools`) emits exactly one `permission_decision` activity, whose `toolCall` is the mock's `WebFetch` call and whose `outcome` is `cancelled`, and the reply still reads `outcome={"outcome":"cancelled"}`.
- The autonomous path still approves (`outcome={"outcome":"selected","optionId":"once"}`) and still emits its one `permission_decision` record.
- The existing denial case ("denies a tool permission request when no tools are allowed") and `allowedTools` case ("selects the allowed option for a permitted web tool") still pass; the `allowedTools` approval emits no `permission_decision` record.
- `src/acp/activity.test.ts`: no change needed; if it has no case for `permission_decision`, add one asserting the `permission` kind.

## Spec and docs updates

- `product/specs/acp.md` "Provider and model": replace the sentence "The shared ACP transport still denies native permission requests except where a separate consumer explicitly supplies its own allowlist." with the layer-two policy — the shared transport denies every permission request a role session's agent raises (only a separate consumer's own allowlist, such as a monitor's web tools, or an autonomous run approves one) — and the denial activity entry: a denied request on an `ask` or `tell` session appears in its connection record as a `permission` activity entry naming the refused tool. Subplan 4 extends this same paragraph with layer one, completing the two-layer policy.

## Verification

`$janissary/scripts/run.mjs check-diff` green. Manually: with a claude entry first in the `ask` role (its built-in tools are still on until subplan 4, and its adapter asks permission before a shell command or a file write in its default mode), run `ask create a file named probe.txt in this directory using your shell` and confirm in the connection tab's activity that a `permission` entry naming the refused tool appears and no file is created.

## Out of scope

- Turning built-in tools off at launch (subplan 4).
- Recording or changing monitor, conversation, editor persona, or autonomous run permission decisions beyond what they do today.
- A user-visible warning or notification for a denial; the record entry is the only surface.
