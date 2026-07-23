# Split personas into editor/ and monitor/ directories

**Complexity: 5/10** — a directory reorg plus a required `kind` parameter threaded through `loadPersona`/`listPersonas` and their four call sites, and one new persona file. No new subsystem: the in-editor diff-suggestion machinery (`editorSuggest`, hunk parsing, ACP session) already exists and already accepts any persona by name — this plan only scopes which persona names each feature is allowed to see.

## Goal

`ai/personas/` currently stores every persona flat, and both the `monitor` command and the in-editor `>` suggestion request draw from the same undifferentiated list. Split it into `ai/personas/monitor/` (today's monitor personas, unchanged in content) and `ai/personas/editor/` (personas meant to answer in-editor edit requests), and add a new `ai/personas/editor/assistant.md` persona written specifically for that role: given the file being edited and a request, propose the change as one or more diff hunks.

## Background: what already exists (reuse, don't rebuild)

| Need | Already in repo | Location |
| --- | --- | --- |
| Persona file loading/listing | `loadPersona`, `listPersonas` | `src/personas.ts` |
| Directive/tools-line parsing | `parseDirective`, `parsePersonaTools` | `src/persona-parsing.ts` |
| `monitor`/`unmonitor` completion sourcing persona names | `MainController.complete` → `listPersonas()` | `src/controller.ts:208` |
| `monitor` command resolving a persona to spawn | `MonitorManager.start` → `loadPersona(personaName)` | `src/monitor/manager.ts:90` |
| Editor `>` request persona-name list (for the `editorPersonas` RPC, used for tab-completion) | `listPersonas()` | `src/message-handler.ts:117` |
| Editor `>` request resolving + loading the named persona and priming it with the hunk-reply format and live buffer | `editorSuggest` → `listPersonas()` / `loadPersona(match)` | `src/editor-suggest/handler.ts` |

Today all four call sites read the same flat `ai/personas/` directory. This plan gives `loadPersona`/`listPersonas` a required `kind: 'monitor' | 'editor'` parameter and points each call site at the directory matching its role.

## Approach

1. **`src/personas.ts`**: add an exported `PersonaKind = 'monitor' | 'editor'` type. `personasDir(root, kind)` becomes `path.join(root, 'ai', 'personas', kind)`. `loadPersona(name, kind, root = process.cwd())` and `listPersonas(kind, root = process.cwd())` both take `kind` as a required parameter (no default) so every call site names its intent explicitly. Update the "no persona" error message to include the kind-scoped path.
2. **Call sites**:
   - `src/monitor/manager.ts:90` — `loadPersona(personaName, 'monitor')`.
   - `src/controller.ts:208` — `listPersonas('monitor')` (feeds `monitor`/`unmonitor` completion).
   - `src/message-handler.ts:117` — `listPersonas('editor')` (the `editorPersonas` RPC used for the in-editor `>` completion).
   - `src/editor-suggest/handler.ts:32,39` — `listPersonas('editor')` and `loadPersona(match, 'editor')`.
3. **Move existing persona files** (content unchanged) from `ai/personas/*.md` into `ai/personas/monitor/*.md`: `algorithm.md`, `assistant.md`, `link-scout.md`, `researcher.md`, `security.md`, `summarizer.md`.
4. **Add `ai/personas/editor/assistant.md`**, a new persona written for the in-editor role: it receives the file being edited (via the existing buffer-priming + hunk-format machinery already built into `editorSuggest`) and a request describing a change, and its job is to make that change — not to comment on or summarize the file. Same `[//]: # <harness>:<model>:<variant>` directive convention as existing personas.
5. **`src/personas.test.ts`**: thread `kind` through every `loadPersona`/`listPersonas` call, write fixture files under `ai/personas/<kind>/`, and point the real-file assertion (`the assistant persona` describe block) at `loadPersona('assistant', 'monitor')`.
6. **`help.md`**: line 99 currently says the `monitor`/`unmonitor` first argument "completes against persona names (from `ai/personas/`)" — update to `ai/personas/monitor/`.

No changes needed to `product/specs/*.md` (they describe behavior, not file paths, and neither `monitoring.md` nor `editor-tab.md` names the `ai/personas/` path today) or to the task picker (`src/tasks.ts` already walks only `ai/tasks/`, never `ai/personas/`).

## Implementation steps

1. `src/personas.ts` — add `PersonaKind`, thread it through `personasDir`/`loadPersona`/`listPersonas`.
2. Update the four call sites (`src/monitor/manager.ts`, `src/controller.ts`, `src/message-handler.ts`, `src/editor-suggest/handler.ts`) to pass the correct kind. Run `./scripts/run.mjs check-diff` — typecheck should catch any missed call site.
3. `git mv` the six existing persona files into `ai/personas/monitor/`.
4. Write `ai/personas/editor/assistant.md`.
5. Update `src/personas.test.ts` for the new signature and directory layout.
6. Update `help.md:99`.
7. Run `./scripts/run.mjs check-diff`.

## Tests

- `src/personas.test.ts`: extend existing `loadPersona`/`listPersonas` cases to write fixtures under a `kind` subdirectory and pass `kind` explicitly; add a case confirming `listPersonas('monitor', root)` and `listPersonas('editor', root)` see only their own subdirectory's files (a persona present under one kind is invisible to the other).
- No new test needed for the four call-site changes — they're covered by existing `editor-suggest/handler.test.ts` and `monitor/manager` tests, which mock `personas.js` entirely and are unaffected by the new required parameter (mocks ignore call args).

## Out of scope

- Changing the behavior of the existing in-editor suggestion feature (hunk format, ACP session reuse, accept/decline UX) — this plan only changes which directory its persona list is drawn from.
- Adding more editor personas beyond `assistant.md`.
- Changing `monitor`'s runtime behavior or any existing monitor persona's content.
