# Carry the role session `_meta` to remote hosts (protocol 39)

**Complexity: 3/10** — One optional field threaded through five remote modules (options, frame type, sender, decoder, server) plus a protocol version bump, all in one change so typecheck stays green; the decoder validation and the version-history rationale are the only parts needing care. Also carries the series' end-to-end verification.

## Goal

A role session hosted on a remote machine gets the same internal-tool denial as a local one. Since subplan 4, a remote claude role session loses its `sessionMeta` (the `_meta` that empties the Claude adapter's built-in tool set) at `createRemoteAcpSession`, so it runs with layer two alone. This subplan carries `sessionMeta` on the `acp-open` frame to the remote host's `connectAcp` and bumps the remote protocol so a host that would ignore the field is refused at the handshake. It is the final subplan of `product/plans/ready/deny-internal-tools-for-role-acp-connections.md`.

## Design decisions and dependencies

Builds on subplan 3 (`connectAcp` accepts `sessionMeta` and sends it as `_meta`) and subplan 4 (`AcpLaunch.sessionMeta`, populated for claude role entries and spread into `createRemoteAcpSession` by `src/acp/session-manager.ts`). The version bump also covers subplan 1: a remote host must have the bundled adapters to run a claude or codex role entry.

- Remote, in one change so typecheck stays green: `RemoteAcpOptions` and the frame built at `src/remote/acp-session.ts` (`type: 'acp-open'`) carry `sessionMeta`; the `acp-open` member of `ClientFrame` in `src/remote/protocol-frames.ts` gains it as optional; `decodeAcpOpen` validates it as a plain JSON-valued object (reject arrays, `null`, and non-JSON values, as `decodeEnv` does for `env`); `serve-acp.ts` `open` hands it to `connectAcp`.
- `REMOTE_PROTOCOL_VERSION` becomes 39 with a version-history entry in `src/remote/protocol.ts` explaining that a version-38 remote would ignore the field and start a role session with its built-in tools on, so exact-version refusal prevents silent exposure. Local/remote hosts must both run a build with the bundled adapters, which the exact-version handshake already forces.
- `src/acp/session-manager.ts`: nothing to pass — the remote launch site already spreads `...launch` into `createRemoteAcpSession`; the change is only that `RemoteAcpOptions` now declares and forwards `sessionMeta`.
- The frame omits `sessionMeta` when unset (as it does `env`, `offline`, `autonomous`, `effort`), so non-claude role sessions, autonomous runs, and other remote ACP sessions send the same frame as today apart from the version.
- Validation detail: frames arrive parsed from JSON, so nested values are JSON by construction; the decoder's job is the top-level shape — a non-null, non-array object is accepted as is, and anything else (array, `null`, string, number, boolean) makes the frame malformed. Put it in a `decodeSessionMeta` helper beside `decodeEnv` so `decodeAcpOpen`'s condition does not grow past the cognitive-complexity limit.
- The denial activity record (subplan 2) already reaches the local record through the existing `acp-activity` frame; no change for it here.
- No opt-out in this version; scope stays core `ask` and `tell` sessions (autonomous remote runs set no `sessionMeta`).

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| Remote ACP launch frame | `src/remote/acp-session.ts` `RemoteAcpOptions`, `src/remote/protocol-frames.ts` (`acp-open`), `src/remote/frame/decode-acp.ts` `decodeAcpOpen`, `src/remote/serve-acp.ts` `open`, `src/remote/protocol.ts` | Already carries `command`, `args`, `env`, `offline`, `autonomous`, `effort`; gains one optional field and a version bump (currently `REMOTE_PROTOCOL_VERSION = 38`). |
| Map validation precedent | `src/remote/frame/decode-acp.ts` `decodeEnv` | Same reject-array-and-`null` shape for the new helper. |
| Session `_meta` transport | `src/acp/types.ts` `AcpOptions.sessionMeta` (subplan 3) | What `serve-acp.ts` hands the field to. |
| Role launch carrying `sessionMeta` | `src/acp/launch.ts` `AcpLaunch` (subplan 4), `src/acp/session-manager.ts` `...launch` spread | The value the local side sends. |
| Remote frame and version tests | `src/remote/acp-session.test.ts`, `src/remote/serve-acp.test.ts`, `src/remote/protocol.test.ts` (acp-open round-trip, rejection table, `it('is 38'`) | Extended for the field and the bump. |

## Proposed changes

- `src/remote/acp-session.ts`: `RemoteAcpOptions` gains `sessionMeta?: Record<string, unknown>`; `createRemoteAcpSession` destructures it and the `acp-open` send adds `...(sessionMeta !== undefined && { sessionMeta })`. Update the `RemoteAcpOptions` comment.
- `src/remote/protocol-frames.ts`: the `acp-open` member of `ClientFrame` gains `sessionMeta?: Record<string, unknown>`.
- `src/remote/frame/decode-acp.ts`: new `decodeSessionMeta(value)` returning the object, `undefined`, or `'invalid'`; `decodeAcpOpen` rejects `'invalid'` and spreads the field into the decoded frame when present.
- `src/remote/serve-acp.ts` `open`: pass `sessionMeta: frame.sessionMeta` to `connectAcp`.
- `src/remote/protocol.ts`: `REMOTE_PROTOCOL_VERSION = 39` and a version-39 history comment as described above.

## Tests

- `src/remote/acp-session.test.ts`: the `acp-open` frame carries `sessionMeta` when the options set it, and omits it otherwise (the existing opencode frame assertion keeps passing unchanged).
- `src/remote/protocol.test.ts` (where `decodeAcpOpen` is exercised through frame decoding): an `acp-open` with a valid `sessionMeta` object round-trips; the malformed-frame table gains `acp-open with an array sessionMeta`, `with a null sessionMeta`, and `with a string sessionMeta` (non-object); the existing "accepts an acp-open carrying no env and no offline flag" case keeps passing; `it('is 38'` becomes `it('is 39'` expecting 39.
- `src/remote/serve-acp.test.ts`: `open` forwards `sessionMeta` to `connectAcp` (and passes `undefined` when the frame has none).
- `src/acp/manager.test.ts` (its `remoteSetup` already drives a remote role session over a mock channel): with a claude entry, the `acp-open` frame the channel is sent carries the claude `sessionMeta`; the existing opencode `objectContaining` assertion keeps passing.

## Spec and docs updates

- `product/specs/remote-server.md`: a "Protocol version 39" paragraph after the version-38 one, in the style of the existing version paragraphs — 39 adds the optional `sessionMeta` field to `acp-open`, a plain object the remote passes as the ACP session's `_meta` (role sessions use it to turn the Claude adapter's built-in tools off); an array, `null`, or non-object value makes the frame malformed; a version-38 remote would ignore the field and start a role session with its built-in tools on, so the handshake refuses the mismatch; both hosts also need the bundled adapters, which the exact-version handshake ensures.
- `product/specs/acp.md`: remove the clause subplan 4 added saying a remote-hosted claude role session has layer two only — local and remote role sessions now get the same configuration.

## Verification

`$janissary/scripts/run.mjs check-diff` green (lint, typecheck, server tests).

End-to-end integration check for the whole series (subplans 1–6), done once here:

1. For each of a claude, a codex, and an opencode role entry (move each to the top of the `ask` role in turn, `ask reset` between), run `ask` with a prompt that tempts the agent to use a built-in tool — `ask read the file package.json in this directory and tell me its name field`, then `ask fetch https://example.com and summarize it` — and confirm the tool is not used (no built-in tool step in the connection tab, no file read, no fetch) and any denied request shows in the connection tab's activity as a `permission` entry.
2. Confirm the role session starts without `npx` network access: the claude and codex sessions run from the install's `node_modules/.bin`, and no `npx` process or npm-registry fetch occurs.
3. Confirm the primer lines: `ask what tools can you use?` answers that it has no built-in tools and names only the granted commands.
4. Repeat steps 1–3 once on a remote tab whose host runs the same build. Also confirm a remote host on the previous build is refused at the handshake with the protocol-mismatch message naming versions 38 and 39.
5. Regression: a monitor persona and an autonomous `agent` run still launch through their existing paths (`npx` claude for monitors) with their own permission policies.

## Out of scope

- Any opt-out, per-role override, or `roles.json` field for internal tools.
- Monitor, conversation, editor persona, and autonomous `agent` run launches and permission policies, local or remote.
- Warning the user when a harness cannot be configured.
- Any frame change beyond the one optional `acp-open` field.
