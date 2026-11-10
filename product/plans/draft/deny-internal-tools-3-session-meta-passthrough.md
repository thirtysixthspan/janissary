# Pass launch-supplied session `_meta` through `connectAcp`

**Complexity: 2/10** — One optional field on `AcpOptions`, a conditional `_meta` on `conn.newSession`, and a mock-agent mode plus two test cases; no caller sets it yet and nothing else changes.

## Goal

The Claude ACP adapter takes its per-session options, including the built-in tool set, from the `_meta` of the ACP `session/new` request rather than from arguments or environment. This subplan gives `connectAcp` a way to send one, so subplan 4 can put the claude deny-all configuration there. It is plumbing for `product/plans/ready/deny-internal-tools-for-role-acp-connections.md` layer one; no session sends `_meta` until subplan 4 populates it.

## Design decisions and dependencies

Builds on nothing earlier; it is independent of subplans 1 and 2 and can land in any order relative to them. Subplan 4 depends on it.

- `AcpOptions` gains an optional `sessionMeta` record (`Record<string, unknown>`, a plain JSON-valued object). `connectAcp` passes it as `_meta` on `conn.newSession`, and omits `_meta` entirely when it is unset — no `_meta: undefined`, no empty object — so every existing session's `session/new` request is byte-for-byte what it is today.
- The field is generic transport, not policy: `connectAcp` does not inspect or merge it. What goes in it for which harness is decided in `src/acp/internal-tools.ts` (subplan 4) and carried by `AcpLaunch` (subplan 4) through the existing `...launch` spread in `src/acp/session-manager.ts`.
- `src/acp/index.ts` has 184 raw lines and stays under the 200-line code limit with these few lines. If it does not — subplan 2 adds lines here too — extract the permission handler into its own module (e.g. `src/acp/permission-handler.ts`) rather than compacting.

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| ACP session creation | `src/acp/index.ts` `ensureSession` (`conn.newSession({ cwd, mcpServers: [] })`) | Gains the conditional `_meta`. |
| ACP SDK request type | `@agentclientprotocol/sdk` `NewSessionRequest` | Already declares an optional `_meta` object; no SDK change. |
| Connection options | `src/acp/types.ts` `AcpOptions` | Gains `sessionMeta`. |
| Mock ACP agent | `src/acp/index.test.ts` (the `session/new` handler and the `connect` helper) | Gains a mode that reports the received `_meta`. |

## Proposed changes

- `src/acp/types.ts`: add `sessionMeta?: Record<string, unknown>` to `AcpOptions`, with a comment saying it is sent as the `session/new` `_meta` and that role launches set it (see `src/acp/internal-tools.ts`, added in subplan 4 — word the comment so it is accurate now, e.g. "per-session adapter options a launch supplies").
- `src/acp/index.ts` `ensureSession`: `conn.newSession({ cwd: options.cwd, mcpServers: [], ...(options.sessionMeta !== undefined && { _meta: options.sessionMeta }) })`.

## Tests

`src/acp/index.test.ts`:

- Add a `meta` mock-agent mode whose `session/new` handler records `'_meta' in message.params` and its value, and whose prompt reply reports them (e.g. `meta=<JSON or absent>`).
- `session/new` carries `_meta` equal to the given object when `sessionMeta` is set.
- `session/new` omits `_meta` (the key is absent, not `null`) when `sessionMeta` is unset.
- Extend the `connect` helper with the new parameter (or an options object for its trailing parameters, if one more positional argument hurts readability); every existing case keeps passing.

## Spec and docs updates

None. The field is internal transport with no user-visible behavior until subplan 4, whose spec text describes the resulting policy.

## Verification

`$janissary/scripts/run.mjs check-diff` green. Manually: run any `ask` prompt and confirm it answers as before (no caller sets `sessionMeta` yet, so this is a regression check only).

## Out of scope

- Choosing any `_meta` content or setting it for any harness (subplan 4).
- Carrying `sessionMeta` over the remote `acp-open` frame (subplan 6).
- Any change to `acpLaunchFor` or non-role sessions; none of them set the field.
