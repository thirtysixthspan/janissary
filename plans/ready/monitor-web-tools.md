# Persona-enabled web tools for monitors

**Complexity: 5/10** — one new pure module plus a config-line parser and a threaded option, but correctness hinges on cross-harness permission-flow behavior (the allowlist only works if the agent actually asks via `requestPermission`) and on touching every `Persona` construction site to keep typecheck green.

## Goal

Let a monitoring persona opt into a small, fixed set of web tools — **web search** and **web fetch** — via a config line in the persona file, so a persona like `link-scout` or `researcher` can actually look things up instead of relying on the model's training knowledge. Every other tool stays denied. Personas that declare no tools behave exactly as today (fully tool-less).

This is deliberately narrow: only `web_search` and `web_fetch`, only when the persona explicitly opts in, only through the existing monitor ACP session.

## Background: why monitors are tool-less today

Monitors are dedicated ACP subprocesses spawned per persona (`src/monitor-acp.ts`). Tool-less-ness is enforced in one place: `connectAcp`'s permission callback at `src/acp.ts:53` (`async requestPermission()`) auto-denies **every** tool permission request by returning `{ outcome: { outcome: 'cancelled' } }`.

The client also advertises `clientCapabilities: {}` at `src/acp.ts:66` (inside `ensureSession`'s `conn.initialize({ ... clientCapabilities: {} })`), so the agent is never offered client-side fs/terminal tools. Web search and web fetch are **agent-native / provider-side** tools (Claude's server tools; opencode's built-in `webfetch`), not client-provided ones — so enabling them does **not** require advertising any client capability, and `clientCapabilities: {}` stays untouched.

The monitor subprocess is not sandboxed (`workspaceDir`/`offline` are never set for monitors — see the comment at `src/monitor-acp.ts:8`, "monitor sessions never set them"), so outbound network is already reachable at the OS level. The permission handler is therefore the *entire* enforcement boundary; this plan keeps it as the boundary and just makes it selective.

## What already exists (reuse, don't rebuild)

| Need | Already in repo | Location |
| --- | --- | --- |
| Per-persona harness config parsed from a `[//]: #` line | `parseDirective` → `PersonaHarness` | `src/persona-parsing.ts:7` |
| Persona loading (reads first line as directive, rest as body) | `loadPersona` | `src/personas.ts:27` |
| The single tool-permission choke point | `requestPermission` auto-deny | `src/acp.ts:53` |
| Spawning the monitor ACP subprocess per harness | `spawnMonitorSession` | `src/monitor-acp.ts:15` |
| Connection options object passed to the subprocess | `AcpOptions` | `src/types.ts:278` |
| ACP permission request/response shapes | `RequestPermissionRequest`, `PermissionOption`, `ToolKind`, `RequestPermissionOutcome` | `@agentclientprotocol/sdk` `dist/schema/types.gen.d.ts:108,591,196,5418` |
| Test pattern that asserts `connectAcp` options via a mock | `vi.mock('./acp.js')` + `expect.objectContaining` | `src/monitor-acp.test.ts:8,36` |

## Design

### 1. Persona config line (`persona-parsing.ts`, `personas.ts`, `types.ts`)

A persona file's first line is the harness directive:

```
[//]: # opencode:google/gemini-3.1-flash-lite:default
```

Add an **optional second config line**, in the same `[//]: #` comment style, listing the tools the persona may use:

```
[//]: # opencode:google/gemini-3.1-flash-lite:default
[//]: # tools: web_search, web_fetch
```

Rationale for a second line rather than a fourth colon-segment on the directive: `parseDirective` treats everything between the first and last colon as the model (`src/persona-parsing.ts:22`, `spec.slice(first + 1, last)`), and models legitimately contain `/` and could contain `:`. A fourth segment would make that split ambiguous. A separate, self-labeling `tools:` line is unambiguous and leaves room for future config lines without disturbing the directive grammar.

Parsing rules (decisions, not options):
- The `tools:` line is **optional**. Absent → `tools: []` → fully tool-less (today's behavior, unchanged for every existing persona).
- Value is a comma-separated list. Each entry is trimmed and lowercased, then matched against a fixed exported allowlist constant `SUPPORTED_PERSONA_TOOLS = ['web_search', 'web_fetch']` (define it in `persona-parsing.ts`).
- An unknown tool name **throws** a load error, consistent with how `parseDirective` already fails fast on a malformed/unknown harness (`src/persona-parsing.ts:19,24`). Message form: `Persona "<name>" requests unknown tool "<x>" (supported: web_search, web_fetch).` Failing loudly matters — a silently-ignored request would make a persona look enabled when it isn't.
- An empty `tools:` line (label present, no entries) is treated as `[]`.
- Duplicate entries are de-duplicated.

Type and loader changes:
- Add a **required** field `tools: string[]` to `Persona` (`src/personas.ts:13`). Required, not optional: `loadPersona` always produces it (`[]` when absent), so downstream code never branches on `undefined`.
- Put the tools-line parsing in `src/persona-parsing.ts` next to `parseDirective` (new exported function, e.g. `parsePersonaTools(name, line) => string[]`), so `personas.ts` stays a thin loader and both files stay well under the 200-line `max-lines` limit (currently 51 and 28 lines).
- `loadPersona` (`src/personas.ts:27`) currently splits on the first newline. Change it to scan the **leading** `[//]: #` comment lines: line 1 is the required harness directive (unchanged), an optional immediately-following `tools:` comment line is parsed, and the body is everything after the recognized config lines (trimmed, as today). A `[//]: #` line that is present but is not a recognized `tools:` line should be treated as the start of the body (do not error), so ordinary markdown comments in a body are unaffected.

Because `tools` becomes required on `Persona`, **every inline `Persona` construction site must be updated** in the same change to keep typecheck green (add `tools: []`):
- `src/monitor-info.test.ts:10`
- `src/monitor-acp.test.ts:19` (`makePersona` helper)
- `src/monitor-session.test.ts:10`

(The production constructor is `loadPersona` itself, which sets the field.)

### 2. Thread the allowlist into the ACP connection (`monitor-acp.ts`, `types.ts`)

- Add `allowedTools?: string[]` to `AcpOptions` (`src/types.ts:278`).
- In `spawnMonitorSession` (`src/monitor-acp.ts:15`), pass `allowedTools: persona.tools` into **both** `connectAcp` calls (the opencode branch at line 20 and the claude branch at line 29).

No other monitor code changes. Tool use happens **inside** a single `conn.prompt` turn: the agent searches/fetches, then emits its final `agent_message_chunk` text, which the existing `onChunk`/`onEnd` handling in `MonitorManager.flush` (`src/monitor-manager.ts:130`) already collects. Multi-step tool turns resolve when `conn.prompt` returns its `stopReason` (`src/acp.ts:87`). The 30s flush cadence is unchanged.

### 3. Selective permission handler (`acp.ts` + new `acp-tools.ts`)

Replace the blanket auto-deny at `src/acp.ts:53` with an allowlist check. The verified SDK shapes it must use:
- The callback receives a `RequestPermissionRequest` with `toolCall: ToolCallUpdate` (its `kind?: ToolKind` and `title?: string` are both optional) and `options: PermissionOption[]` (each has `optionId` and `kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'`).
- To allow, return `{ outcome: { outcome: 'selected', optionId } }` choosing the option whose `kind` is `allow_once` (prefer least-privilege; fall back to `allow_always` only if no `allow_once` is offered). To deny, return `{ outcome: { outcome: 'cancelled' } }` exactly as today.

Behavior contract (describe in prose in the plan; the implementer writes it):
- Classify the requested tool from `toolCall` into a canonical id (`web_search`, `web_fetch`, or none). If the id is non-null **and** present in `options.allowedTools`, select an allow option. Otherwise deny (`cancelled`).
- Because `allowedTools` is `undefined` for every non-monitor caller and for tool-less personas, the handler collapses to today's unconditional deny for all existing paths — a required regression guarantee.

Put the classification in a **new pure module `src/acp-tools.ts`** (exported `classifyTool(toolCall) => 'web_search' | 'web_fetch' | null`), keeping `acp.ts` (currently 100 lines) from growing past `max-lines` and keeping the `sonarjs/cognitive-complexity` warning off the connection code. Classification rules, grounded in the real `ToolKind` union (`"read" | "edit" | "delete" | "move" | "search" | "execute" | "think" | "fetch" | "switch_mode" | "other"`):
- **`web_fetch`**: `toolCall.kind === 'fetch'` is a strong, unambiguous signal (fetch = retrieve a URL). Also accept a title/name normalized match on `/web[_ ]?fetch|webfetch/` for adapters that leave `kind` unset.
- **`web_search`**: `kind === 'search'` is **ambiguous** — a local file/codebase search tool also reports `kind: 'search'`. Do **not** map `kind: 'search'` to `web_search` on its own. Require a title/name match on `/web[_ ]?search/` (optionally corroborated by `kind === 'search'`) so a grep/file-search tool is never mistaken for web search.
- Anything not confidently classified returns `null` → denied. Erring toward deny keeps the boundary safe.

## Cross-harness caveat (the main correctness risk — decide before building)

The allowlist mechanism assumes the agent **asks** for permission via ACP `requestPermission`. That holds for the `claude` adapter (`@zed-industries/claude-code-acp`), whose server tools route through the standard permission flow. It may **not** hold for `opencode` — the default harness in every current persona:
- If opencode runs `webfetch` **without** asking (its own permission config allows it), our `requestPermission` gate is never consulted and the persona `tools:` line has no gating effect (the tool runs regardless of what the line says).
- If opencode **refuses** web tools by default and never asks, approving at the ACP layer never happens either, and the persona can't fetch.

Either way, for opencode the effective control likely lives in opencode's own config, which `spawnMonitorSession` passes as `OPENCODE_CONFIG_CONTENT` — but that path currently sends **only** `{ model }` because "opencode rejects unknown keys, and a rejected config kills the subprocess on startup" (`src/monitor-acp.ts:21-22`). Adding a `permission`/`tools` key there needs verification that opencode accepts it.

Decision for this plan: **the reference persona that gets the `tools:` line should use the `claude` harness**, where the `requestPermission` gate is authoritative, and the opencode enablement path is explicitly deferred (see Out of scope). This keeps the shipped mechanism correct rather than silently no-op on the default harness. Capture one real `requestPermission` payload from the claude adapter for a web fetch and a web search before finalizing `classifyTool`.

## Security considerations

Enabling web fetch on a monitor is a real trust decision:
- **Monitors receive full transcripts**, including whatever secrets/output scrolled by (exactly what the `security` persona watches for — `ai/personas/security.md`). A fetch-enabled persona could place transcript content into a request and send it to an arbitrary host — an exfiltration surface tool-less monitors don't have.
- The opt-in living in the **persona file** (checked into the repo, reviewable) is itself the primary control: turning on tools is a visible diff, not a runtime toggle.
- Keep the allowlist to `web_search`/`web_fetch` only; never route a generic HTTP/shell tool through this mechanism.

## Files touched

- `src/persona-parsing.ts` — `parsePersonaTools` + `SUPPORTED_PERSONA_TOOLS`; validation/throw on unknown tool.
- `src/personas.ts` — `Persona.tools: string[]` (required); `loadPersona` reads the optional second config line.
- `src/types.ts` — `AcpOptions.allowedTools?: string[]`.
- `src/acp-tools.ts` — **new** pure module: `classifyTool`.
- `src/acp.ts` — selective `requestPermission` using `classifyTool` + `options.allowedTools`; update the "MVP: auto-deny" comment at line 52 and the module-header note at lines 18-20.
- `src/monitor-acp.ts` — pass `allowedTools: persona.tools` in both branches; update the "inherently tool-less" comment at lines 7-9.
- `src/monitor-info.test.ts`, `src/monitor-acp.test.ts`, `src/monitor-session.test.ts` — add `tools: []` to inline `Persona` literals.
- `specs/monitoring.md` — the opening line (line 3) calls monitors "tool-less"; revise to describe the web-tools opt-in and its security note.
- `ai/personas/link-scout.md` (recommended reference persona) — switch its directive to a `claude` harness, add the `tools: web_search, web_fetch` line, and relax the "you have no tools / never guess a URL" language now that it can actually fetch.

## Tests

- `src/personas.test.ts` (there is **no** `persona-parsing.test.ts`; parsing is covered here): `tools:` line present / absent / empty; unknown tool → throws with the stated message; case/whitespace tolerance; de-duplication; body still parsed correctly when the extra config line is present; a non-`tools:` `[//]: #` line in the body is treated as body, not an error.
- `src/acp-tools.test.ts` (**new**, colocated per `src/**/*.test.ts` convention): representative claude and opencode tool-call shapes → correct canonical id; `kind: 'search'` from a non-web (file) search title → `null` (guards the ambiguity); `kind: 'fetch'` → `web_fetch`; unknown shape → `null`.
- `src/monitor-acp.test.ts`: extend the existing `expect.objectContaining` assertions (pattern at line 36) to check `allowedTools` is forwarded as `persona.tools` for both harness branches; add a case with a non-empty `tools` array.
- Permission-handler wiring in `acp.ts`: assert that with `allowedTools` undefined the handler denies (regression guard for tool-less behavior), and with an allowed classified tool it selects the `allow_once` option. `connectAcp` has no direct unit test today; either add a focused `src/acp.test.ts` that drives the client's `requestPermission` with a synthetic `RequestPermissionRequest`, or exercise it through the existing `acp-manager.test.ts` harness — prefer the focused `acp.test.ts` since the logic is now branchy.

## Verification

- During development: `./scripts/run.mjs check-diff` after each change (lints changed files, incremental typecheck, related server tests). Expect the `Persona.tools` field to surface typecheck errors at every construction site until all are updated — a useful checklist.
- Manual end-to-end: give `ai/personas/link-scout.md` the `claude` harness + `tools: web_search, web_fetch` line, start a monitor on a tab whose transcript mentions a specific library/API, and confirm (a) the monitor performs a fetch/search and returns a link grounded in fetched content rather than memory, and (b) a persona **without** the `tools:` line still has every tool request denied (start `security` or `assistant` on the same tab and confirm no tool runs).

## Open questions / assumptions to verify before implementing

1. **opencode permission routing** (the load-bearing one — see Cross-harness caveat). Confirm whether `opencode acp` surfaces `webfetch`/web-search through ACP `requestPermission` at all, or runs/denies them per its own config. This determines whether opencode enablement needs an `OPENCODE_CONFIG_CONTENT` change (and whether opencode accepts such a key without dying on startup). The plan ships claude-only enablement to sidestep this; revisit if opencode support is wanted.
2. **Real claude tool-call shapes.** Capture one live `requestPermission` payload from `@zed-industries/claude-code-acp` for a web fetch and a web search to pin `classifyTool`'s title/kind matching (the `ToolKind` union is verified, but the adapter's exact `title` strings are not).
3. **Tool-progress surfacing.** Whether to render a lightweight "searching…" indicator by handling `tool_call` session updates (currently only `agent_message_chunk` is handled, `src/acp.ts:48`) or stay silent. Recommended: stay silent for the first version — the final suggestion is what matters.
4. **Latency/cost.** Web tools add per-flush latency and cost; the 30s cadence bounds it. No change proposed, noted only.

## Out of scope

- Any tool beyond `web_search`/`web_fetch` (no fs, terminal, MCP, or generic HTTP).
- **opencode** web-tool enablement (deferred pending open question #1); this plan enables the `claude` harness path only.
- A runtime/per-invocation tool toggle on the `monitor` command line — tools are a property of the persona definition, by design.
- Sandboxing/egress-filtering the monitor subprocess.
- Rendering tool-call progress in the transcript or reporting tab.
