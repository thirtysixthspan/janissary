# Pass launch-supplied session `_meta` through `connectAcp`

**Complexity: 2/10** — ~6 added production lines across 2 files (`src/acp/types.ts`, `src/acp/index.ts`), 3 requirements, 2 test scenarios, no new units (p=3.85)

## Goal

The Claude ACP adapter takes its per-session options, including the built-in tool set, from the `_meta` of the ACP `session/new` request rather than from arguments or environment. This subplan gives `connectAcp` a way to send one, so subplan 4 can put the claude deny-all configuration there. It is plumbing for layer one of `product/plans/complete/deny-internal-tools-for-role-acp-connections.md`; no session sends `_meta` until subplan 4 populates it.

## Design decisions and dependencies

Subplans 1 (bundled adapters) and 2 (denial records in `requestPermission`) have already landed on this branch; this subplan does not depend on either and touches none of their code. Subplan 4 depends on it (it sets `AcpLaunch.sessionMeta`), and subplan 6 depends on it (`src/remote/serve-acp.ts` `open` hands `frame.sessionMeta` to `connectAcp`).

- `AcpOptions` gains an optional `sessionMeta?: Record<string, unknown>`, a plain JSON-valued object. The type admits neither `null` nor arrays, although the SDK's `_meta` type admits `null`.
- `connectAcp` passes it as `_meta` on `conn.newSession` when it is not `undefined`, and otherwise omits the `_meta` key entirely: no `_meta: undefined` and no fabricated empty object. Every existing session's `session/new` request is then byte-for-byte what it is today. Test the value with `!== undefined`, not with `'sessionMeta' in options`: subplan 6 will pass `sessionMeta: frame.sessionMeta`, which is an explicit `undefined` for every frame without the field, and that must still omit `_meta`.
- A caller-supplied object is forwarded as given, including `{}`. `connectAcp` does not inspect, validate, clone, or merge it. What goes in it for which harness is decided in `src/acp/internal-tools.ts` (subplan 4) and carried by `AcpLaunch` (subplan 4) through the existing `...launch` spread into `connectAcp` at `src/acp/session-manager.ts` (`...launch, cwd, onError, onConnect, workspaceDir: tab.workspaceDir, ...`).
- SDK compatibility was checked against the installed versions, so no SDK change or upgrade is needed:
  - The root project's `@agentclientprotocol/sdk` (`^1.3.0`, installed 1.3.0), which `connectAcp` uses, declares `_meta?: { [key: string]: unknown } | null` on `NewSessionRequest` (`node_modules/@agentclientprotocol/sdk/dist/schema/types.gen.d.ts`). `ClientSideConnection.newSession` sends its params unchanged via `sendRequest`, so `_meta` goes over the wire as given.
  - The bundled adapters each nest their own SDK 2.0.2. Its v1 `zNewSessionRequest` keeps `_meta` as `z.record(z.string(), z.unknown())` and turns a non-object `_meta` into `undefined` through `defaultOnError` instead of rejecting the request. So a malformed value would be dropped silently, never reported. The `Record<string, unknown>` type is the guard against that.
  - `claude-agent-acp` 0.97.0 reads `params._meta.claudeCode.options` in `createSession` (`userProvidedOptions`, and `userProvidedOptions?.tools` in `dist/acp-agent.js`). That is the key subplan 4 sets. `codex-acp` 2.3.0's bundled schema parses `_meta` the same way, and subplan 4 sends codex no `_meta`.
- Line budget: `src/acp/index.ts` is 190 raw lines and 159 code lines (`max-lines` skips blanks and comments). `src/acp/types.ts` is well under the limit. Both stay far under 200 with this change, so no extraction is needed. Subplan 2's contingency extraction of the permission handler did not happen and is not part of this subplan.

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| ACP session creation | `src/acp/index.ts` `ensureSession` (`conn.newSession({ cwd: options.cwd, mcpServers: [] })`) | Gains the conditional `_meta`. |
| Conditional-key spread precedent | `src/remote/acp-session.ts` (`...(env !== undefined && { env }), ...(offline !== undefined && { offline })`) | The house way to omit a key when unset; use the same shape. |
| ACP SDK request type | `@agentclientprotocol/sdk` `NewSessionRequest` | Already declares an optional `_meta` object; no SDK change. |
| Connection options | `src/acp/types.ts` `AcpOptions` | Gains `sessionMeta`. |
| Mock ACP agent | `src/acp/index.test.ts` `STUB_AGENT` (the `session/new` and `session/prompt` branches of `handle`) and the `connect` helper | Gains a `meta` mode that reports the received `_meta`. |

## Proposed changes

- `src/acp/types.ts`: add `sessionMeta?: Record<string, unknown>` to `AcpOptions`, after `effort`. Its comment says that it is sent as the `session/new` `_meta`, that it holds per-session adapter options a launch supplies, and that it is omitted when unset. Keep the wording accurate before subplan 4 lands: do not claim any caller sets it.
- `src/acp/index.ts` `ensureSession`: `conn.newSession({ cwd: options.cwd, mcpServers: [], ...(options.sessionMeta !== undefined && { _meta: options.sessionMeta }) })`. Nothing else in `connectAcp` changes, including the header comment and `requestPermission`.
- No caller changes. None of the production `connectAcp` callers sets the field: `src/acp/session-manager.ts`, `src/monitor/acp.ts`, `src/agent/execute.ts`, `src/conversations/sessions.ts`, and `src/remote/serve-acp.ts`. `AcpLaunch` does not carry it until subplan 4.

## Tests

`src/acp/index.test.ts`:

- `STUB_AGENT` gains a `meta` mode. Its `session/new` branch records whether the `_meta` key is present in `message.params`, and its value. Record this in every mode; only `meta` reads it. In `meta` mode, the `session/prompt` handler replies with a single chunk and returns before the generic `protocol=... sessions=...` and `hello` chunks. The chunk is `meta=` followed by `JSON.stringify` of the received value when the key is present, or `meta=absent` when it is not, and the handler ends the turn with `end_turn`. The stub is the body of a `String.raw` template literal, so the added code must contain no backticks and no `${` (the existing `stderr` comment there says the same).
- `connect` gains a seventh positional parameter, `sessionMeta?: Record<string, unknown>`, passed straight through to `connectAcp`. Do not convert it to an options object, so the existing call sites stay untouched. The last existing parameter, `installedSkillDirs`, already uses this style (`connect('basic', undefined, true, undefined, undefined, installedSkillDirs)`).
- New case, placed after the existing permission cases: with `sessionMeta` set to the nested shape subplan 4 will send, `{ claudeCode: { options: { tools: [] } } }`, the reply is exactly `meta={"claudeCode":{"options":{"tools":[]}}}`. This shows that nesting and an empty array survive the transport unchanged.
- New case: with `sessionMeta` unset, the reply is exactly `meta=absent`. The key is absent, not `null` and not `{}`.
- Every existing case keeps passing unchanged. They all run without `sessionMeta`, so they also exercise the omitted path.

## Spec and docs updates

None. The field is internal transport with no user-visible behavior until subplan 4, whose spec text describes the resulting policy.

## Verification

`$janissary/scripts/run.mjs check-diff` green. Manually: run any `ask` prompt on a role entry and confirm it answers as before. No caller sets `sessionMeta` yet, so this is a regression check only.

## Out of scope

- Choosing any `_meta` content or setting it for any harness, including `AcpLaunch.sessionMeta` and the `acpLaunchForEntry` merge (subplan 4).
- Carrying `sessionMeta` over the remote `acp-open` frame, its decoder, and the protocol bump (subplan 6).
- The primer lines (subplan 5).
- Any change to `acpLaunchFor` or to non-role sessions; none of them set the field.
- Upgrading the root `@agentclientprotocol/sdk` to match the adapters' 2.x; 1.3.0 already supports `_meta`.
