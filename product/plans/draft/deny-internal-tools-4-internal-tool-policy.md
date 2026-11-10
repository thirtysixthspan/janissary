# Turn harness built-in tools off at launch for role sessions

**Complexity: 5/10** — A new pure policy module whose per-harness keys must each be confirmed against the pinned adapters' documentation and source before they are written, a merge into `acpLaunchForEntry` that has to keep opencode's model configuration intact, an `AcpLaunch` field, test updates in three files, and five spec/doc edits.

## Goal

Role-based ACP connections — the core `ask` and `tell` sessions — deny every tool the agent harness ships with. This subplan adds layer one of `product/plans/ready/deny-internal-tools-for-role-acp-connections.md`: each role entry's launch carries a harness-specific configuration that turns the harness's built-in tools off, so they are never offered to the model. The only thing such an agent may then do is run the Janissary native commands its role grants and that are enabled for agents in `commands.json`. Layer two (the permission-request denial, recorded since subplan 2) stays as the backstop.

Feature text: "Configure all role based acp connections to deny all internal tool usage by default. The agent should only be allowed to execute janissary commands that have been enabled for agents in commands.json."

## Design decisions and dependencies

Builds on subplan 1 (the bin-named claude and codex launches and the pinned adapter versions the keys are confirmed against) and subplan 3 (`connectAcp` sends `AcpOptions.sessionMeta` as `session/new` `_meta`). Subplan 2's denial record is the layer-two surface this layer sits in front of.

- "Internal tools" means the tools the harness itself provides to the model — shell, file read/write/edit, search, web fetch and search, sub-agents — not Janissary native commands, which run through the existing tool loop.
- The Janissary command gate is unchanged: a role's grants are intersected with effective agent access in `commands.json`, the primer lists only those commands, and each emitted command is re-checked before it runs (`product/specs/acp.md`, `product/specs/application-commands.md`).
- Two layers. Layer one disables the harness's built-in tools at launch so they are never offered to the model. Layer two is the existing permission-request denial in `connectAcp` (`requestPermission` in `src/acp/index.ts`, `decidePermission` in `src/acp/tools.ts`), kept as is.
- No opt-out in this version. Every `ask` and `tell` connection denies all internal tools, always. `roles.json` gains no field.
- Scope is core `ask` and `tell` sessions only: everything launched through `AcpSessionManager.session` and `acpLaunchForEntry`, local and remote, including plugin-owned ask sessions and the launcher summarizer. Monitor personas (`src/monitor/acp.ts`), conversations (`src/conversations/sessions.ts`), editor persona queries, and autonomous `agent` runs (`src/agent/execute.ts`) keep their current launches (`acpLaunchFor`) and permission policies. `acpLaunchFor` is unchanged.
- A role entry whose harness has no known deny-all configuration still launches, protected by layer two alone, with no warning. This is also the rule when a key below cannot be confirmed against the pinned adapter: the module returns no configuration for that harness rather than a guessed one. A single unconfirmed key is omitted (the harness keeps its confirmed keys); a harness with no confirmed key returns nothing.
- Exact key spellings are confirmed against the pinned adapters' documentation and source (the versions subplan 1 pinned; for opencode, opencode's permissions documentation and source) before they are written, and then pinned by tests. Record in the module's comments which adapter version and source file or doc page each key was confirmed against.
- Per harness:
  - opencode — a permission configuration denying every tool, in the single-value form opencode's permissions documentation describes, merged into the existing `OPENCODE_CONFIG_CONTENT` model configuration, so the model setting survives alongside the deny-all.
  - claude — a `sessionMeta` of `{ claudeCode: { options: { tools: [] } } }` shape that empties the built-in tool set. Confirm in the pinned `claude-agent-acp` source how it reads `_meta.claudeCode.options` on `session/new`, and in its pinned `@anthropic-ai/claude-agent-sdk` that an empty `tools` list disables every built-in tool rather than meaning "default set".
  - codex — `-c` overrides that put the sandbox in its most restrictive mode and disable web search and the shell tool, and never set the approval policy to `never`, since an approval that is never asked would let sandboxed execution run unseen instead of reaching layer two. Confirm against the pinned `codex-acp` and the `@openai/codex` version it depends on.
- Module shape: one pure function takes the role entry's harness and that harness's base launch environment and returns the extra launch configuration, `{ args?, env?, sessionMeta? }`, or `undefined` for a harness with no confirmed configuration. It takes the base environment only so the opencode case can return `OPENCODE_CONFIG_CONTENT` as the base JSON with the deny-all merged in (the caller's env spread then replaces the base value with the merged one); this keeps the merge pure and testable in the module, which is where the source plan's "opencode keeps its model configuration" test lives. The module does no I/O.
- `src/acp/session-manager.ts`: nothing to pass — both launch sites already spread `...launch`; the change is only that the spread now carries `sessionMeta`. Locally it reaches `connectAcp` (subplan 3). The remote site's spread also carries it, but `createRemoteAcpSession` drops it until subplan 6; until then a remote claude role session has layer two only (opencode and codex deny-all travel in `env`/`args`, which the remote frame already carries).
- The module also exports the two primer lines as constants; those are added in subplan 5, which owns the primer.

## What already exists (reuse, don't rebuild)

| Existing | Where | Use |
| --- | --- | --- |
| Role entry launch per harness | `src/acp/launch.ts` `acpLaunchForEntry` (bin-named since subplan 1) | Already sets harness env and args (opencode `OPENCODE_CONFIG_CONTENT`, codex `-c key=value`); the deny-all configuration merges here, for role entries only. |
| Role session creation | `src/acp/session-manager.ts` `AcpSessionManager.session` | The one call site that launches role entries. It spreads `...launch` into both `connectAcp` and `createRemoteAcpSession`, so a new `AcpLaunch` field reaches both without a separate pass. |
| Session `_meta` transport | `src/acp/types.ts` `AcpOptions.sessionMeta`, `src/acp/index.ts` (subplan 3) | Carries the claude configuration to `session/new`. |
| Permission-request denial and its record | `src/acp/index.ts` `requestPermission` (subplan 2), `src/acp/tools.ts` `decidePermission` | Layer two, unchanged. |
| Record guard | `src/value-guards.ts` `isRecord` | Guards the parsed opencode base config before merging. |

## Proposed changes

- New pure module `src/acp/internal-tools.ts` owning the internal-tool policy for role sessions, with the function described above (name it for what it returns, e.g. `internalToolDenial(harness, baseEnv)`), and per-harness content as listed in the design decisions. Keep it well under 200 lines; it imports nothing effectful (`.js` extensions on relative imports).
- `src/acp/launch.ts`: `AcpLaunch` gains an optional `sessionMeta?: Record<string, unknown>`. `acpLaunchForEntry` builds the base launch exactly as after subplan 1, then merges the module's output: `args` appended after the existing model/effort args, `env` spread over the base env, `sessionMeta` set when present. A harness the module returns nothing for keeps its base launch. `acpLaunchFor` is unchanged. Update the comment above `acpLaunchForEntry`.
- `src/acp/session-manager.ts`: no code change; optionally a one-line comment at the `...launch` spreads noting they carry `sessionMeta`.

## Tests

- `src/acp/internal-tools.test.ts` (new): each harness's configuration, pinned to the confirmed key spellings; opencode keeps its model configuration alongside the deny-all (parse the returned `OPENCODE_CONFIG_CONTENT` and assert both `model` and the permission value); codex never sets approval to `never` (assert no arg matches `approval_policy` with `never`, in any quoting); claude returns only `sessionMeta` with an empty `tools` list; an unconfirmed or unknown harness (e.g. `gemini`) returns `undefined`.
- `src/acp/launch.test.ts`: role entries launch the adapter `bin` names (from subplan 1) with the module's output merged — claude carries the `sessionMeta`, codex's args end with the deny-all overrides after model and effort, opencode's `OPENCODE_CONFIG_CONTENT` holds model and permission; the opencode case no longer equals `acpLaunchFor`'s output and is rewritten accordingly; `acpLaunchFor` output is byte-for-byte unchanged (the two existing `acpLaunchFor` cases keep passing untouched).
- `src/acp/manager-fallback.test.ts`: the codex argument-list assertions gain the deny-all overrides; add one assertion that a local claude role session's `connectAcp` options carry the `sessionMeta` (pins the "spread already carries it" claim).
- `src/monitor/acp.test.ts`: unchanged and passing — monitors get no deny-all configuration.

## Spec and docs updates

- `product/specs/acp.md` "Provider and model": extend the layer-two paragraph subplan 2 wrote into the two-layer policy — role connections launch each harness with its built-in tools turned off (opencode through a deny-all permission configuration, claude through the session's tool set, codex through its most restrictive sandbox with web search and shell disabled and approvals still asked); a harness with no known configuration runs with layer two alone and no warning; no opt-out. Add one clause that a claude role session hosted on a remote machine has layer two only, because the remote launch frame does not yet carry the session options; subplan 6 removes that clause when it closes the gap, so the spec matches the code at every step.
- `product/specs/roles.md` "ACP role behavior": role connections deny all internal tools; roles grant only native commands.
- `help/ask.md` and `help/tell.md` Notes: one sentence each that the agent has no built-in tools (no shell, file, or web tools of its own) and can only run the granted native commands.
- `documentation/user-documentation/advanced-agents/acp-agent.md`: one sentence, next to the paragraph about ask and tell grants, that the agent has no built-in tools.

## Verification

`$janissary/scripts/run.mjs check-diff` green. Manually, locally: for a claude, a codex, and an opencode `ask` entry in turn, run `ask read the file package.json in this directory and tell me its name field` and confirm the agent does not read the file with a built-in tool (it answers that it cannot, or uses a granted native command); with the claude entry, confirm the connection tab shows no built-in tool steps. Full end-to-end verification, including remote, is in subplan 6.

## Out of scope

- Any opt-out, per-role override, or `roles.json` field for internal tools.
- Changing which native commands a role grants or how `commands.json` agent access is evaluated.
- Monitor, conversation, editor persona, and autonomous `agent` run launches and permission policies, including their adapter packages and their `npx` claude launch.
- Warning the user when a harness cannot be configured.
- The primer lines (subplan 5) and the remote `sessionMeta` field (subplan 6).
