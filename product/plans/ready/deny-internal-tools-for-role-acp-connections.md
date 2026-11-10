# Deny internal tool usage on role-based ACP connections

**Complexity: 7/10** — ~170 added lines across 12 production files, 11 requirements, and 16 test scenarios, including a remote wire-version bump and two new dependencies (p=6.64)

## Goal

Role-based ACP connections — the core `ask` and `tell` sessions — deny every tool the agent harness ships with. The only thing such an agent may do is run the Janissary native commands its role grants and that are enabled for agents in `commands.json`. Today the connection only refuses the permission requests an agent chooses to raise; a harness that runs its own tools without asking, or that auto-approves read-only tools, is not restrained. This plan turns the harness's built-in tools off at launch and keeps the request denial as a second layer.

Feature text: "Configure all role based acp connections to deny all internal tool usage by default. The agent should only be allowed to execute janissary commands that have been enabled for agents in commands.json."

## Design decisions

- "Internal tools" means the tools the harness itself provides to the model — shell, file read/write/edit, search, web fetch and search, sub-agents — not Janissary native commands, which run through the existing tool loop.
- The Janissary command gate is unchanged: a role's grants are intersected with effective agent access in `commands.json`, the primer lists only those commands, and each emitted command is re-checked before it runs (`product/specs/acp.md`, `product/specs/application-commands.md`).
- Two layers. Layer one disables the harness's built-in tools at launch so they are never offered to the model. Layer two is the existing permission-request denial in `connectAcp` (`requestPermission` in `src/acp/index.ts`, `decidePermission` in `src/acp/tools.ts`), kept as is.
- No opt-out in this version. Every `ask` and `tell` connection denies all internal tools, always. `roles.json` gains no field.
- Scope is core `ask` and `tell` sessions only: everything launched through `AcpSessionManager.session` and `acpLaunchForEntry`, local and remote, including plugin-owned ask sessions and the launcher summarizer. Monitor personas (`src/monitor/acp.ts`), conversations (`src/conversations/sessions.ts`), editor persona queries, and autonomous `agent` runs (`src/agent/execute.ts`) keep their current launches (`acpLaunchFor`) and permission policies.
- A role entry whose harness has no known deny-all configuration still launches, protected by layer two alone, with no warning. This is also the rule when a key below cannot be confirmed against the pinned adapter: the module returns no configuration for that harness rather than a guessed one.
- Adapters ship in the manifest, not through `npx`. `@agentclientprotocol/claude-agent-acp` and `@agentclientprotocol/codex-acp` become exact-pinned `dependencies` in `package.json`, replacing the deprecated `@zed-industries/*` packages that `acpLaunchForEntry` fetched at runtime. Role launches run the installed copy; opencode stays a binary on the user's `PATH`. `acpLaunchFor` (monitors, conversations, agent runs) keeps its current `npx` claude launch and is not touched.
- The role primer tells the model it has no built-in tools. With at least one command available after intersecting grants and agent access, the line `You have no built-in tools; use only the commands listed here.` follows the allow-list line. With none available — no grants, every granted command excluded, or a session a plugin started with `withoutTools` — the line `You have no tools; answer in prose.` goes where the allow-list line would be, immediately after any group primers that remain, so `withoutTools` sessions such as the launcher summarizer receive it too.
- When `connectAcp` denies a permission request on a non-autonomous session, it records the denial through `onActivity` as the same `permission_decision` update the autonomous branch already emits. The connection record's `permission` activity entry then names the refused tool. Today the denial is silent. Only sessions that pass `onActivity` record it — role sessions and remote-hosted role sessions; monitors and conversations pass none and are unaffected.
- The two new dependencies are checked against the supply-chain blocklist before they are added (see Implementation order).

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| Permission-request denial | `src/acp/index.ts` `requestPermission`, `src/acp/tools.ts` `decidePermission` | Layer two; gains the denial activity record. |
| Role entry launch per harness | `src/acp/launch.ts` `acpLaunchForEntry` | Already sets harness env and args (opencode `OPENCODE_CONFIG_CONTENT`, codex `-c key=value`); the deny-all configuration merges here, for role entries only. |
| Role session creation | `src/acp/session-manager.ts` `AcpSessionManager.session` | The one call site that launches role entries. It spreads `...launch` into both `connectAcp` and `createRemoteAcpSession`, so a new `AcpLaunch` field reaches both without a separate pass. |
| Executing-side command lookup | `src/acp/command-path.ts` `locateAcpCommand`, called from `connectAcp` | Runs on whichever host runs the agent — the local server, or the remote server through `serve-acp` — so it is where an installed adapter is found for both. |
| Install root and `PATH` search | `src/janissary-root.ts` `janissaryRoot`, `src/acp/command-path.ts` `findOnPath` | Locate an installed adapter's `bin` with no new resolution code. `src/browser/playwright-paths.ts` `resolvePackageDir` (`createRequire`) is the heavier layout-independent precedent, noted as the upgrade path. |
| Sandbox read access to the install's dependencies | `src/sandbox/harness-spawn.ts` `resolveExecutableDirs` / `packageRootDir` | An absolute command inside `node_modules/` already has that whole `node_modules/` carved into the Seatbelt read allow-list. |
| Remote ACP launch frame | `src/remote/acp-session.ts` `RemoteAcpOptions`, `src/remote/protocol-frames.ts` (`acp-open`), `src/remote/frame/decode-acp.ts` `decodeAcpOpen`, `src/remote/serve-acp.ts` `open`, `src/remote/protocol.ts` | Already carries `command`, `args`, `env`, `offline`, `autonomous`, `effort`; gains one optional field and a version bump (currently `REMOTE_PROTOCOL_VERSION = 38`). |
| Permission activity kind | `src/acp/activity.ts` `acpActivity` | Already classifies `permission_decision` updates as `permission`; its text is the update's JSON, as for autonomous decisions. |
| Role primer assembly | `src/acp/run-prompt.ts` (the `primer:` array), `src/acp/tool-table.ts` `toolPrimer` | Where the no-built-in-tools line is added. |
| Supply-chain gate | `$janissary/scripts/run.mjs check-malicious-package` | Run on both new packages at their exact versions before they enter `package.json`. |

## Proposed changes

- New pure module `src/acp/internal-tools.ts` owning the internal-tool policy for role sessions. One function takes a role entry's harness and returns the extra launch configuration, `{ args?, env?, sessionMeta? }`, or nothing for a harness with no confirmed configuration. Its content, per harness: opencode — a permission configuration denying every tool, in the single-value form opencode's permissions documentation describes, merged into the existing `OPENCODE_CONFIG_CONTENT` model configuration; claude — a `sessionMeta` of `{ claudeCode: { options: { tools: [] } } }` shape that empties the built-in tool set; codex — `-c` overrides that put the sandbox in its most restrictive mode and disable web search and the shell tool, and never set the approval policy to `never`, since an approval that is never asked would let sandboxed execution run unseen instead of reaching layer two. The module also exports the two primer lines as constants. Exact key spellings are confirmed against the pinned adapters' documentation and source before they are written and then pinned by tests; a key that cannot be confirmed is omitted, which leaves that harness on layer two (see Design decisions).
- `package.json`: add the two adapters under `dependencies` at exact versions; regenerate `package-lock.json` with `npm install --ignore-scripts`.
- `src/acp/command-path.ts`: `locateAcpCommand` gains one step ahead of its existing lookups — the file's own `findOnPath` is run over the install's `node_modules/.bin` (`path.join(janissaryRoot(), 'node_modules', '.bin')`, with `janissaryRoot` from `src/janissary-root.ts`), and a hit returns the absolute path. The result lives inside `node_modules/`, so the existing sandbox carve-in applies. A name with no entry there falls through unchanged, so opencode and `acpLaunchFor`'s `npx` are unaffected. The same function runs on a remote host's own install. Ceiling: this assumes the adapters sit under the install's own `node_modules`, which holds for a checkout and a global npm install; a layout that hoists them elsewhere would fail to find the `bin` name and report the agent failing to start, and the upgrade path is resolving through `createRequire` as `src/browser/playwright-paths.ts` `resolvePackageDir` does.
- `src/acp/launch.ts`: `AcpLaunch` gains an optional `sessionMeta` record. `acpLaunchForEntry` launches claude and codex entries by their adapters' `bin` names (no `npx`, no package argument) and merges the module's output into each role entry. `acpLaunchFor` is unchanged.
- `src/acp/types.ts` and `src/acp/index.ts`: `AcpOptions` gains an optional `sessionMeta`; `connectAcp` passes it as `_meta` on `conn.newSession`, and omits `_meta` when it is unset. In `requestPermission`, a denied request on a non-autonomous session emits the `permission_decision` update through `onActivity` before returning the `cancelled` outcome; the autonomous branch is unchanged. `src/acp/index.ts` has 184 raw lines and stays under the 200-line code limit with these few lines; if it does not, extract the permission handler into its own module rather than compacting.
- `src/acp/session-manager.ts`: nothing to pass — both launch sites already spread `...launch`; the change is only that the spread now carries `sessionMeta`.
- Remote, in one change so typecheck stays green: `RemoteAcpOptions` and the frame built at `src/remote/acp-session.ts` (`type: 'acp-open'`) carry `sessionMeta`; the `acp-open` member of `ClientFrame` in `src/remote/protocol-frames.ts` gains it as optional; `decodeAcpOpen` validates it as a plain JSON-valued object (reject arrays, `null`, and non-JSON values, as `decodeEnv` does for `env`); `serve-acp.ts` `open` hands it to `connectAcp`; `REMOTE_PROTOCOL_VERSION` becomes 39 with a version-history entry in `src/remote/protocol.ts` explaining that a version-38 remote would ignore the field and start a role session with its built-in tools on, so exact-version refusal prevents silent exposure. Local/remote hosts must both run a build with the bundled adapters, which the exact-version handshake already forces.
- `src/acp/run-prompt.ts`: append the matching primer line when assembling the `primer:` array — after the allow-list line when `allowedCommands` is nonempty, after any group primers otherwise. The `tell` instruction and the Markdown instruction keep their positions after it.

## Implementation order

1. Run `$janissary/scripts/run.mjs check-malicious-package` on both packages at the chosen versions; stop and choose other versions on exit 2 or 3. Add them to `package.json`, regenerate the lockfile, then run `./scripts/run.mjs check-malicious-package --audit ./package-lock.json`.
2. `internal-tools.ts` and its test; then `launch.ts`, `command-path.ts`, and their tests.
3. `types.ts`, `index.ts` (session `_meta`, denial activity) and tests.
4. The remote change as one step (frame type, decoder, sender, server, version, version test), then the primer change in `run-prompt.ts`.
5. Specs and docs, then `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/acp/internal-tools.test.ts`: each harness's configuration; opencode keeps its model configuration alongside the deny-all; codex never sets approval to `never`; an unconfirmed or unknown harness returns nothing.
- `src/acp/launch.test.ts` (it asserts the old `@zed-industries/*` argument lists today and must be updated): role entries launch the adapter `bin` names with the module's output; `acpLaunchFor` output is byte-for-byte unchanged. `src/acp/manager-fallback.test.ts` also names the old package and needs the same update.
- `src/acp/command-path.test.ts`: a name present in the install's `node_modules/.bin` resolves to its absolute path; any other name falls through to the existing `PATH` behavior.
- `src/acp/index.test.ts` (the `permission` mock-agent mode exists): `session/new` carries `_meta` when `sessionMeta` is set and omits it otherwise; a denied request on a non-autonomous session emits exactly one `permission_decision` activity; the autonomous path still approves and the existing denial and `allowedTools` cases still pass.
- `src/acp/manager.test.ts` / `src/acp/tool-table.test.ts`: the primer ends with the available-commands line, the no-tools line with none available, and the no-tools line for a `withoutTools` session; the existing assertion that no allow-list line appears for an empty grant keeps passing.
- Remote: `src/remote/acp-session.test.ts` sends `sessionMeta` in the frame; a decoder test for `decodeAcpOpen` accepts a valid object and rejects an array, `null`, and a non-object; `src/remote/serve-acp.test.ts` forwards it to `connectAcp`; `src/remote/protocol.test.ts` (`it('is 38'`) becomes 39.

## Spec and docs updates

- `product/specs/acp.md`: replace the sentence that the shared transport "denies native permission requests" with the two-layer policy, the primer lines, the denial activity entry, and the bundled adapters.
- `product/specs/roles.md`: role connections deny all internal tools; roles grant only native commands.
- `product/specs/remote-server.md`: protocol version 39 and the `acp-open` `sessionMeta` field, in the style of its existing version paragraphs.
- `help/ask.md`, `help/tell.md`, and `documentation/user-documentation/advanced-agents/acp-agent.md`: one sentence each that the agent has no built-in tools.

## Out of scope

- Any opt-out, per-role override, or `roles.json` field for internal tools.
- Changing which native commands a role grants or how `commands.json` agent access is evaluated.
- Monitor, conversation, editor persona, and autonomous `agent` run launches and permission policies, including their adapter packages and their `npx` claude launch.
- Warning the user when a harness cannot be configured.

## Verification

`$janissary/scripts/run.mjs check-diff` during development. Manually: for each of a claude, a codex, and an opencode role entry, run `ask` with a prompt that tempts the agent to use a built-in tool (read a file in the working directory, fetch a URL) and confirm the tool is not used and any denied request shows in the connection tab's activity; confirm the role session starts without `npx` network access. Repeat once on a remote tab whose host runs the same build.
