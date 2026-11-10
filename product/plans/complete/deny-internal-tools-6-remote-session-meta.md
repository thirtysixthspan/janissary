# Carry the role session `_meta` to remote hosts (protocol 39)

**Complexity: 5/10** — ~20 added lines across 5 files, 6 requirements, 12 test scenarios (frame send/omit, decoder accept/reject, server forward, version, remote claude vs opencode) (p=5.35); the series' end-to-end verification adds manual effort the score does not count

## Goal

A role session hosted on a remote machine gets the same internal-tool denial as a local one. Since subplan 4, a remote claude role session loses its `sessionMeta` (the `_meta` that empties the Claude adapter's built-in tool set) at `createRemoteAcpSession`, so it runs with the permission-request denial alone. This subplan carries `sessionMeta` on the `acp-open` frame to the remote host's `connectAcp`, bumps the remote protocol so a host that would ignore the field is refused at the handshake, and removes the temporary "remote claude keeps its built-in tools" caveat from the five documents that state it. It is the final subplan of `product/plans/complete/deny-internal-tools-for-role-acp-connections.md`, and it also carries that plan's end-to-end Verification for the whole series.

## Design decisions and dependencies

Builds on subplan 3 (`connectAcp` accepts `AcpOptions.sessionMeta` and sends it as `_meta` on `session/new`, `src/acp/index.ts` "`_meta: options.sessionMeta`") and subplan 4 (`AcpLaunch.sessionMeta`, set by `acpLaunchForEntry` in `src/acp/launch.ts` for claude entries only). Subplans 1–5 and the caveat fix plan (`product/plans/complete/remote-claude-built-in-tools-caveat.md`) are all on this branch; nothing else must land first.

- Why the remote claude session loses the field today: `src/acp/session-manager.ts` calls `createRemoteAcpSession(channel, { ...launch, id: ..., offline: tab.offline }, ...)`, so `sessionMeta` is already in the options object at runtime, but `RemoteAcpOptions` does not declare it and `createRemoteAcpSession` destructures only `id, command, args, env, offline, autonomous, effort`, so the field never reaches the frame. Codex and opencode already get their launch-time denial remotely, because theirs travels in `env` (`INITIAL_AGENT_MODE`, `CODEX_CONFIG`, `OPENCODE_CONFIG_CONTENT`).
- Remote, in one change so typecheck stays green: `RemoteAcpOptions` and the `send({ type: 'acp-open', ... })` in `src/remote/acp-session.ts` carry `sessionMeta`; the `acp-open` member of `ClientFrame` in `src/remote/protocol-frames.ts` gains it as optional; `decodeAcpOpen` in `src/remote/frame/decode-acp.ts` validates it; `RemoteAcp.open` in `src/remote/serve-acp.ts` hands it to `connectAcp`; `REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts` goes from 38 to 39. Land the code, the tests, and the doc/spec edits in one commit.
- `REMOTE_PROTOCOL_VERSION` is 38 on this branch and on `master` (verified). The only literal pin is `src/remote/protocol.test.ts` `it('is 38'`; every other test (`serve-start.test.ts`, `serve.test.ts`, `channel/index.test.ts`, the mismatch and older-version cases in `protocol.test.ts`) uses the constant, and no user doc names a number (`documentation/user-documentation/advanced-agents/remote-agents.md` shows the mismatch message with `<n>`/`<m>` placeholders). If master has moved past 38 by implementation time, use the next number after whatever it is and adjust every "38"/"39" in this plan to match.
- Version-history comment: append a "Version 39" entry after the "Version 38" entry above `export const REMOTE_PROTOCOL_VERSION` in `src/remote/protocol.ts`, in the same voice: version 39 adds an optional `sessionMeta` to `acp-open`, the ACP session `_meta` that turns a role session's Claude built-in tools off; a version-38 remote drops undeclared fields while decoding (see the existing "drops undeclared properties from an acp-open" test), so it would start the role session with its built-in tools on while both ends looked healthy, and exact-version refusal prevents that silent exposure. Both hosts must also have the bundled adapters from subplan 1, which the exact-version handshake already guarantees.
- `src/acp/session-manager.ts`: no change — its `...launch` spread already supplies the field once `RemoteAcpOptions` declares it.
- `src/agent/execute.ts` (the autonomous `agent` run's `createRemoteAcpSession` call) builds its options field by field and sets no `sessionMeta`: no change, and its frame stays as it is today.
- The frame omits `sessionMeta` when unset, exactly as it omits `env`, `offline`, `autonomous`, and `effort` (`...(x !== undefined && { x })`), so opencode and codex role sessions, autonomous runs, and every other remote ACP session send the same frame as today.
- Decoder: frames arrive through `JSON.parse`, so nested values are JSON by construction and the decoder checks only the top-level shape. Add `decodeSessionMeta(value: unknown)` beside `decodeEnv` in `decode-acp.ts`, returning `undefined` when the value is absent, the value itself when `isRecord(value)` holds (reuse `isRecord` from `src/value-guards.ts`, imported as `'../../value-guards.js'` the way `decode-filesystem.ts` does), and `'invalid'` for anything else (array, `null`, string, number, boolean). An empty object `{}` is accepted and forwarded unchanged. Contents are not inspected — the remote passes them through as `_meta`, and the local side is the only author. `decodeAcpOpen` adds `sessionMeta === 'invalid'` to its existing malformed condition (keep the helper so that condition gains one term, not a nested check, staying under the cognitive-complexity limit) and spreads `...(sessionMeta !== undefined && { sessionMeta })` into the result.
- `RemoteAcp.open` passes `sessionMeta: frame.sessionMeta` to `connectAcp`, next to `offline: frame.offline` and `effort: frame.effort` (which pass `undefined` the same way).
- The denial activity record (subplan 2) already reaches the local record through the existing `acp-activity` frame (`'permission'` is in `ACP_ACTIVITY_KINDS`, `src/acp/activity.ts`); no change for it here.
- No opt-out in this version; scope stays core `ask` and `tell` sessions.
- File sizes: every touched production file stays well under the 200-line limit (non-blank, non-comment lines: `acp-session.ts` ~139, `decode-acp.ts` ~62, `serve-acp.ts` ~146, `protocol-frames.ts` ~151, `protocol.ts` ~78). No extraction needed.

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| Remote ACP launch frame | `src/remote/acp-session.ts` `RemoteAcpOptions` / `createRemoteAcpSession`, `src/remote/protocol-frames.ts` (`type: 'acp-open'` member of `ClientFrame`), `src/remote/frame/decode-acp.ts` `decodeAcpOpen`, `src/remote/serve-acp.ts` `RemoteAcp.open`, `src/remote/protocol.ts` `REMOTE_PROTOCOL_VERSION = 38` | Already carries `command`, `args`, `env`, `offline`, `autonomous`, `effort`; gains one optional field and a version bump. |
| Optional-field spread pattern | `src/remote/acp-session.ts` `...(env !== undefined && { env })`, `decodeAcpOpen`'s return | Same pattern for `sessionMeta` on the send and on the decoded frame. |
| Map validation precedent | `src/remote/frame/decode-acp.ts` `decodeEnv` (returns value, `undefined`, or `'invalid'`) | Same three-way contract for `decodeSessionMeta`. |
| Plain-object guard | `src/value-guards.ts` `isRecord` | The whole top-level check. |
| Session `_meta` transport | `src/acp/types.ts` `AcpOptions.sessionMeta`, `src/acp/index.ts` (`_meta: options.sessionMeta`) | What `serve-acp.ts` hands the field to. |
| Role launch carrying `sessionMeta` | `src/acp/launch.ts` `acpLaunchForEntry`, `src/acp/internal-tools.ts` `claudeDenial`, `src/acp/session-manager.ts` `...launch` spread | The value the local side sends: `{ claudeCode: { options: { tools: [] } } }`. |
| Remote frame and version tests | `src/remote/acp-session.test.ts` (`OPTIONS`, `fakeChannel`), `src/remote/serve-acp.test.ts` (`OPEN`, `acpMock.options`), `src/remote/protocol.test.ts` (client round-trip list, malformed table, `FULLY_POPULATED_FRAMES`, `it('is 38'`), `src/acp/manager.test.ts` (`remoteSetup`, `CLAUDE`, `GEMINI`) | Extended for the field and the bump. |

## Proposed changes

- `src/remote/acp-session.ts`: `RemoteAcpOptions` gains `sessionMeta?: Record<string, unknown>`; `createRemoteAcpSession` destructures it and the `acp-open` send adds `...(sessionMeta !== undefined && { sessionMeta })`. Extend the comment above `RemoteAcpOptions` ("which agent runs, with what arguments and environment, and whether it is confined offline") to say it also carries the ACP session options that turn a role session's built-in tools off.
- `src/remote/protocol-frames.ts`: the `acp-open` member of `ClientFrame` gains `sessionMeta?: Record<string, unknown>`.
- `src/remote/frame/decode-acp.ts`: new `decodeSessionMeta` as described above; `decodeAcpOpen` rejects `'invalid'` as `malformed('acp-open')` and spreads the field when present.
- `src/remote/serve-acp.ts` `RemoteAcp.open`: pass `sessionMeta: frame.sessionMeta` to `connectAcp`.
- `src/remote/protocol.ts`: `REMOTE_PROTOCOL_VERSION = 39` and the version-39 history comment as described above.

## Tests

- `src/remote/acp-session.test.ts`: a new case calls `createRemoteAcpSession(fakeChannel().channel, { ...OPTIONS, sessionMeta: { claudeCode: { options: { tools: [] } } } }, hooks)` directly (the `makeSession` helper uses the fixed `OPTIONS`) and expects the single sent `acp-open` frame to equal the existing expected frame plus that `sessionMeta`. The existing "attaches a listener for its id and sends the open frame" case, whose `toEqual` has no `sessionMeta` key, keeps passing unchanged and covers the omitted case.
- `src/remote/protocol.test.ts`:
  - add `sessionMeta: { claudeCode: { options: { tools: [] } } }` to `FULLY_POPULATED_FRAMES['acp-open']`, so "keeps every optional field of acp-open" round-trips it;
  - the malformed-frame table gains `acp-open with an array sessionMeta` (`sessionMeta: []`), `acp-open with a null sessionMeta`, and `acp-open with a string sessionMeta`;
  - add one case that an `acp-open` with `sessionMeta: {}` round-trips (empty object accepted);
  - "accepts an acp-open carrying no env and no offline flag" and "drops undeclared properties from an acp-open" keep passing unchanged;
  - `it('is 38'` becomes `it('is 39'` expecting 39.
- `src/remote/serve-acp.test.ts`: `open` with `{ ...OPEN, sessionMeta: { claudeCode: { options: { tools: [] } } } }` puts that value in `acpMock.options[0].sessionMeta`; `open(OPEN)` leaves `acpMock.options[0].sessionMeta` undefined.
- `src/acp/manager.test.ts` (`remoteSetup` drives a remote role session over a mock channel with the real `acpLaunchForEntry` and `createRemoteAcpSession`): a session opened with `acp.session('tab1', '/cwd', CLAUDE, hooks)` sends an `acp-open` matching `expect.objectContaining({ type: 'acp-open', command: 'claude-agent-acp', sessionMeta: { claudeCode: { options: { tools: [] } } } })`; one opened with `GEMINI` (opencode) sends an `acp-open` with no `sessionMeta` key. The existing opencode `objectContaining` assertion in "backs the session with the channel and never spawns an agent locally" keeps passing.

## Spec and docs updates

- `product/specs/remote-server.md`:
  - a "Protocol version 39" paragraph after the "Protocol version 38" paragraph, in the style of the existing version paragraphs — 39 adds the optional `sessionMeta` field to `acp-open`, a plain object the remote passes as the ACP session's `_meta` (role sessions use it to turn the Claude adapter's built-in tools off); a version-38 remote would ignore the field and start a role session with its built-in tools on, so the handshake refuses the mismatch; both hosts also need the bundled adapters, which the exact-version handshake ensures;
  - in the frame-validation paragraph (the sentence beginning "An ACP frame's agent command must be a nonempty string"), add that its session options, when present, must be a plain object — an array, a null, or a scalar is refused.
- Remove the caveat sentence "For now, a `claude` role session hosted on a remote machine keeps its built-in tools: it can still read files, and every permission request it raises is denied." from all four places that carry it word for word, and find them by searching "hosted on a remote machine":
  - `help/ask.md` and `help/tell.md`: delete the sentence from the end of the Notes bullet that starts "The agent has no built-in tools"; the rest of the bullet stays.
  - `documentation/user-documentation/advanced-agents/acp-agent.md` and `product/specs/roles.md` (`## ACP role behavior`): the sentence is on its own source line; delete that line only.
- `product/specs/acp.md` (the two-layer paragraph in the connections section): replace "A harness with no known configuration runs with the second layer alone and no warning, and so does a `claude` role session hosted on a remote machine, because the remote launch frame does not yet carry the session options." with "A harness with no known configuration runs with the second layer alone and no warning." and add right after it: "A role session hosted on a remote machine gets both layers: the remote launch request carries the same built-in-tool configuration, session options included."
- After the edits, a repo search for "hosted on a remote machine" outside `product/plans/` returns only the new `product/specs/acp.md` sentence. `src/acp/internal-tools.ts` and `src/acp/launch.ts` comments do not single out remote sessions and need no change.

## Verification

`$janissary/scripts/run.mjs check-diff` green (lint, typecheck, server tests; `src/help-pages.test.ts` and `src/commands.test.ts` cover the edited help pages).

End-to-end integration check for the whole series (subplans 1–6), done once here, on a shell tab of a Janissary started from this build (`npm run build`, then `janus`):

1. Role entries: in the `ask` role, move a claude entry, then a codex entry, then an opencode entry to the top in turn, running `ask reset` after each move. For each, run:
   - `ask read the file package.json in this directory and tell me its name field`
   - `ask fetch https://example.com and summarize it`
   - for codex only, `ask create a file named probe.txt containing hello` (its file-edit tool has no off switch and stays behind the read-only mode's approval)

   Confirm in the connection tab that no built-in tool step ran (no Read/Glob/Bash/WebFetch for claude, no shell or web-search for codex, no tool call for opencode), that no `probe.txt` exists, and that any refused request appears as a `permission` activity entry carrying the refused tool call. An agent that answers in prose that it cannot read files or browse, or that runs only a granted native command such as `browser`, passes.
2. No `npx`: while each claude and codex session is open, `ps -ef | grep -E 'claude-agent-acp|codex-acp|npx'` shows the adapter running from the install's `node_modules/.bin` (resolved by `locateAcpCommand`, `src/acp/command-path.ts`) and no `npx` process for it; the codex process environment has `INITIAL_AGENT_MODE=read-only` and a `CODEX_CONFIG` with the disabled features. Opencode runs the `opencode` on `PATH`, as before.
3. Primer lines (subplan 5): `ask what tools can you use?` answers that it has no built-in tools and names only the granted commands; with a role whose `commands` list is empty, the answer says it has no tools.
4. Remote: repeat steps 1–3 once on a remote shell tab whose host runs the same build (run step 2's `ps` on the remote host over ssh). For claude this is the step that proves the change: before it, the remote claude session ran the Read tool on the package.json prompt; now the connection tab shows no built-in tool step. Also launch a remote tab against a host on the previous build and confirm it is refused at the handshake with `Remote janissary speaks protocol version 38; this one speaks 39. Update janissary so both hosts match.`
5. Regression: a monitor persona and an autonomous `agent` run (local and with `on <host>`) still launch through their existing paths (`acpLaunchFor`'s `npx @zed-industries/claude-code-acp` for claude monitors, opencode for `agent`) with their own permission policies, and the remote `agent` run's `acp-open` carries no `sessionMeta`.

## Out of scope

- Any opt-out, per-role override, or `roles.json` field for internal tools.
- Monitor, conversation, editor persona, and autonomous `agent` run launches and permission policies, local or remote.
- Warning the user when a harness cannot be configured.
- Validating the contents of `sessionMeta` beyond its top-level shape.
- Any frame change beyond the one optional `acp-open` field.
