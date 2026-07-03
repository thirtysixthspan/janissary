# Syntax highlighting in the text editor

**Complexity: 6/10** — a new client-side highlighting subsystem (four language modules, registry, tokenizer, hook) whose correctness hinges on merging token ranges into the existing caret/selection segment renderer without breaking its memoization, plus a smaller server half: a new command, a new persisted config field with the first config write-back, a new `StateEvent` field, and a new picker modal.

## Goal

Add syntax highlighting to the editor tab (`EditorTab`), coloring different parts of the text by their syntactic role. Highlighting is powered by [highlight.js](https://github.com/highlightjs/highlight.js), supports markdown, JavaScript, TypeScript, and JSON to start, and is organized so a new language is added by dropping in a new module. The language is chosen by file extension. Themes are supported: `syntax theme <name>` selects a named theme, `syntax theme` opens a theme-selection modal, and exactly one theme is active at a time, applying to every editor tab.

## Design decisions

**Highlighting slots into the existing segment renderer — no new line renderer.** `contentSegments()` (`web/src/editor/render.tsx:30`) already splits each line into spans at a sorted `bounds` set of columns (selection start/end, caret column) and inserts the zero-width caret span. Token boundaries become additional entries in that same `bounds` set, and each emitted segment gets its token's `hljs-*` class alongside the existing `editor-sel` logic. A token never needs to nest around the selection because both are flattened to boundary columns — one flat span list per line, caret behavior untouched.

**Always tokenize the full document, then split into per-line ranges.** Multi-line constructs (markdown code fences, block comments, template literals) make per-line-in-isolation highlighting incorrect. `tokenizeDocument(text, language)` calls `hljs.highlight(text, { language, ignoreIllegals: true })` and converts the result into one token-range array per line, where a range is `{ from, to, scope }` with `scope` the hljs class (e.g. `hljs-keyword`).

**Walk the returned HTML with `DOMParser` — public API only.** Parse `result.value` and walk the node tree with a class stack and a line/column counter, splitting ranges at newlines. Do not touch the private `_emitter` token tree. Walking the parsed DOM (not the raw string) means entities (`&lt;`, `&amp;`, quotes) count as one character, keeping column offsets aligned with the buffer text. `DOMParser` is available both in the browser and in the client test project (`environment: 'jsdom'`, `vitest.config.ts:23`).

**Per-line token arrays must be referentially stable so `EditorLine`'s existing `React.memo` keeps working.** The tokenizer keeps the previous document's line texts and token arrays; when a line's text and computed tokens are unchanged, it returns the previous array object. `EditorLine` (`web/src/editor/render.tsx:49`) keeps its default shallow-compare memo — the new `tokens` prop compares by reference, so unchanged lines skip re-render exactly as they do today. No custom comparator.

**Recompute synchronously on load, debounced 100 ms after edits.** A `useSyntaxHighlight(state, fileName)` hook owns the schedule (`setTimeout` + cleanup in a `useEffect`). The stale-but-close highlight during the debounce window is acceptable; typing latency is unaffected because keystrokes never wait on tokenization.

**Large-file guard: skip highlighting when the buffer exceeds 10,000 lines or 1 MB of text.** The hook returns empty tokens and the editor renders plain text, so pathological files never make typing sluggish.

**One language module per file, discovered via a registry keyed by extension.** Each module in `web/src/editor/highlight/languages/` imports its grammar from `highlight.js/lib/languages/<lang>`, registers it on the shared core instance (`highlight.js/lib/core` — only the four grammars get bundled), and exports a `LanguageModule`:

```ts
export type LanguageModule = {
  // hljs language id, e.g. 'typescript'
  language: string;
  // extensions this module claims, lowercase without the dot
  extensions: string[];
  register: (hljs: HLJSApi) => void;
};
```

Extension claims: markdown → `md`, `markdown`; javascript → `js`, `mjs`, `cjs`, `jsx`; typescript → `ts`, `tsx`, `mts`, `cts`; json → `json`. `registry.ts` holds the module list and exposes `languageForFile(name: string): string | null` (case-insensitive extension match). Adding a language later means one new file under `languages/` plus one entry in the registry list. Unknown or missing extensions return `null` and the editor renders exactly as today. The extension comes from `editor.name` (`EditorView` in `src/types.ts:83`, quoted: `// Plain-text editor view`) — no protocol change for detection.

**Theme names are a shared constant; theme CSS lives web-side.** New `src/syntax-themes.ts` exports `SYNTAX_THEMES: string[]` and `DEFAULT_SYNTAX_THEME = 'github-dark'`. It must stay free of Node imports because the web client bundles it via the `@shared` alias (`web/tsconfig.json:13` `"paths": { "@shared/*": ["../src/*"] }`, mirrored in `web/vite.config.ts:13`), exactly like `@shared/protocol` in `EditorTab.tsx:2`. Server files import it as `./syntax-themes.js` per the NodeNext `.js`-extension rule. Starter set (all shipped in `highlight.js/styles/`): `github-dark`, `github`, `atom-one-dark`, `atom-one-light`, `monokai`, `nord`, `vs2015`, `tokyo-night-dark`.

**Themes apply by swapping one global `<style>` element.** `web/src/editor/highlight/themes.ts` imports each theme's CSS as a string via Vite `?raw` (typed by the existing `/// <reference types="vite/client" />` in `web/src/env.d.ts`) and maps name → CSS. `applySyntaxTheme(name)` writes the CSS into a single `<style id="syntax-theme">` element in `<head>`, replacing the previous content — one theme at a time, global, so it covers all editor tabs at once. hljs theme files also style the bare `.hljs` container class; no element in the app carries that class, so only the `.hljs-*` token rules take effect and the editor keeps its own background, gutter, selection, and caret styling from `theme.css`.

**`syntax theme <name>` is a normal server command; bare `syntax theme` is intercepted client-side like `hist`.** The server command validates, persists, and broadcasts; the interactive modal never reaches the server, mirroring `if (trimmed === 'hist') openPicker();` in `App.tsx:213` (input is already trimmed and lowercased there, so match `trimmed === 'syntax theme'`). If the server does receive bare `syntax theme` (e.g. via `CommandManager.dispatchTo` from another agent), it appends the theme list with the active one marked — a graceful text fallback.

**Persist in `.janissary/config.json` via the first config write-back.** `Config` (`src/types.ts:361`) gains `syntaxTheme: string`; `DEFAULT_CONFIG` (`src/config.ts:8`) gains the default. New `updateConfig(partial: Partial<Config>)` in `config.ts` merges into the in-memory config and writes the file back. `loadConfig(cwd)` is called once at `src/main.ts:125`; it must stash the resolved `configPath` in a module-level variable so `updateConfig` can write without re-deriving the path. Write-back is read-modify-write of the raw file JSON (parse, merge the partial, stringify) so unknown keys a user added by hand survive; a write failure is reported to the transcript by the caller, never thrown.

**The state broadcast carries the theme; the confirmation append triggers it.** `StateEvent` (`src/protocol.ts:67`) gains `syntaxTheme: string`, populated at both construction sites: the `emitState` sink (`src/index.ts:52-55`) and the `init` reply (`src/index.ts:143-146`) — both already read `getConfig().tabNameMaxLength`, so mirror that with `getConfig().syntaxTheme`. The `syntax` command needs no explicit state emit: `TabManager.append` (`src/tab-manager.ts:207`) already emits `state: dirty` when the confirmation line is appended.

**The theme picker reuses the existing picker machinery.** New `ThemePicker.tsx` is modeled on `HistoryPicker.tsx` (same `picker`/`picker-row` CSS classes) with one addition: the active theme's row gets a marker (reuse the `selected` styling pattern; a `✓` prefix on the active row is enough). Keyboard handling reuses `handlePickerKey` (`web/src/keyboard-handlers.ts:19`) unchanged — its `runCommand` parameter is passed a closure that sends `syntax theme <name>` and its `items` are the theme names. In `App.tsx`'s window key handler (`onKey`, `App.tsx:107`), the theme picker is checked after the route chooser and before the history picker; its open flag also joins the `pickerOpen={pickerOpen || route !== null || quitConfirmOpen}` disable-chain on `CommandInput` (`App.tsx:219`). Picking sends the command through the normal path, so persistence and multi-client sync come for free.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| Per-line span splitting at column bounds (selection, caret) | `contentSegments()` at `web/src/editor/render.tsx:30` |
| Memoized line renderer with primitive-ish props | `EditorLine` at `web/src/editor/render.tsx:49` |
| Editor file identity (name/path for extension) | `EditorView` at `src/types.ts:83`, delivered on the tab as `editor` |
| Command shape to copy (arg parsing + confirmation append) | `src/commands/rename.ts`, registered in `src/commands/index.ts` |
| Config load/read pattern | `loadConfig`/`getConfig` in `src/config.ts` |
| Config value on the wire | `tabNameMaxLength` in `StateEvent` (`src/protocol.ts:70`), populated at `src/index.ts:54` and `:145` |
| Client state fan-out | `StateListener` type at `web/src/ws.ts:3`, dispatched at `:29`, consumed only by `App.tsx` `onState` (`App.tsx:84`) |
| Client-intercepted command opening a modal | `hist` → `openPicker()` in `App.tsx:213` |
| Picker component + keyboard handling | `HistoryPicker.tsx`, `handlePickerKey` at `web/src/keyboard-handlers.ts:19` |
| Subcommand tab-completion handler shape | `completeBrowserCommand` in `src/completion-handlers.ts`, chained in `completeCommandLine` (`src/completion.ts:40-45`) |
| Help text source | `buildHelp()` reads README.md's `### Commands` section (`src/commands.ts:24`); fallback list `availableCommands` (`src/commands.ts:6`) |
| Shared server↔web constants | `@shared` alias — `web/tsconfig.json:13`, `web/vite.config.ts:13` |

## Implementation steps

Each step leaves `check-diff` green; 1–2 are server-only, 3–5 are web-only.

### 1. Server: config, protocol, command, completion

- `src/types.ts`: add `syntaxTheme: string` to `Config`.
- `src/syntax-themes.ts`: `SYNTAX_THEMES`, `DEFAULT_SYNTAX_THEME` (no Node imports).
- `src/config.ts`: default entry; `updateConfig` with the stored-path and raw-merge behavior decided above.
- `src/protocol.ts` + `src/index.ts` (both sites): carry `syntaxTheme` in `StateEvent`.
- `src/commands/syntax.ts` modeled on `rename.ts`, registered in `src/commands/index.ts`:
  - `match`: `/^syntax\b/i`.
  - `syntax theme <name>`: case-insensitive lookup in `SYNTAX_THEMES`; on hit, canonicalize to the listed casing, `updateConfig({ syntaxTheme })`, append `Syntax theme set to "<name>".`; on miss, append an error listing the available names. If the config write fails, append a warning that the theme applied for this session but won't persist.
  - `syntax theme` (no arg): append the theme list, active one marked.
  - anything else: append usage (`Usage: syntax theme [name]`).
- `src/completion-handlers.ts`: `completeSyntaxTheme` (argument 1 completes `theme`, argument 2 completes theme names), chained in `completeCommandLine`.
- README.md `### Commands` section: document `syntax theme [name]` so `help` picks it up; add `syntax` to `availableCommands` (`src/commands.ts:6`) for the fallback help string. (README is docs, not source — allowed alongside the feature.)

### 2. Web: theme application wiring

- Add `highlight.js` to `devDependencies` (web-bundle deps live there, matching `react` and `@xterm/xterm` in `package.json`).
- `web/src/editor/highlight/themes.ts`: name → `?raw` CSS map (import order must match `SYNTAX_THEMES`; a unit test asserts the two lists agree), `applySyntaxTheme(name)` with the single-`<style>` swap.
- `web/src/ws.ts`: `StateListener` gains `syntaxTheme: string`; pass it through at line 29.
- `App.tsx`: store it in a `syntaxTheme` state var; a `useEffect` calls `applySyntaxTheme` on change. Editor tabs need no per-tab wiring.

At this point `syntax theme <name>` round-trips end to end; nothing is colored yet because no `hljs-*` spans exist.

### 3. Web: highlighting engine

- `web/src/editor/highlight/hljs.ts`: shared instance from `highlight.js/lib/core`.
- `web/src/editor/highlight/languages/{markdown,javascript,typescript,json}.ts`: one `LanguageModule` each with the extension claims decided above.
- `web/src/editor/highlight/registry.ts`: module list, extension map, `languageForFile`.
- `web/src/editor/highlight/tokenize.ts`: `tokenizeDocument` (DOMParser walk, newline splitting, per-line array reuse cache).

### 4. Web: editor rendering integration

- `web/src/editor/useSyntaxHighlight.ts`: the hook (language resolution, 100 ms debounce, large-file guard, empty result for unhighlighted files).
- `web/src/editor/render.tsx`: `LineProps` gains `tokens`; `contentSegments()` merges token bounds and emits combined classes (`hljs-keyword`, `hljs-keyword editor-sel`, …).
- `web/src/EditorTab.tsx`: call the hook, pass `tokens` per line.
- All touched files are far below the 200-line `max-lines` limit (`render.tsx` is ~57 lines, `EditorTab.tsx` ~128); if the merge logic grows `render.tsx` unexpectedly, extract segment computation into `web/src/editor/segments.ts` rather than compacting.

### 5. Web: theme picker modal

- `web/src/ThemePicker.tsx` modeled on `HistoryPicker.tsx` with the active-row marker.
- `App.tsx`: `themePickerOpen` state; intercept `trimmed === 'syntax theme'` in the `CommandInput` `onSubmit` next to the `hist` branch; wire `handlePickerKey` into `onKey` at the precedence position decided above; join the `CommandInput` `pickerOpen` disable-chain; picking sends `syntax theme <name>` via `runCommand` and closes the picker.

## Tests

- `src/commands/syntax.test.ts` — mirrors `rename.test.ts`: usage on bare `syntax`, valid name persists config and appends confirmation, invalid name lists themes, case-insensitive input canonicalized, bare `syntax theme` lists themes with active marked.
- `src/config.test.ts` — extend: `syntaxTheme` default present in a fresh config file; `updateConfig` writes the file, survives reload, and preserves an unknown key planted in the JSON.
- `src/completion.test.ts` — `syntax` → `theme` completion and theme-name completion.
- `web/src/editor/highlight/tokenize.test.ts` — per-line ranges for each of the four languages, with emphasis on multi-line constructs (markdown fenced code block, TS block comment and template literal spanning lines), entity-bearing source (`<`, `&`, quotes) keeping offsets aligned, and the cache returning identical array objects for unchanged lines.
- `web/src/editor/highlight/registry.test.ts` — extension mapping incl. case-insensitivity, unknown extension and extensionless name → `null`.
- `web/src/editor/highlight/themes.test.ts` — every name in `SYNTAX_THEMES` has CSS; `applySyntaxTheme` swaps the single style element's content.
- `web/src/editor/render.test.tsx` — new file (no render tests exist today; the caret DOM tests live in `web/src/EditorTab.test.tsx`, e.g. "renders a caret span in the active editor"): token segments get `hljs-*` classes, token+selection overlap emits combined classes, caret column still lands exactly between segments when it falls inside a token.
- `web/src/EditorTab.test.tsx` — extend: a `.ts` file renders `hljs-*` spans after load; a `.txt` file renders none.
- `web/src/ThemePicker.test.tsx` — renders the shared list with active marked, click picks; plus an `App`-level test that submitting `syntax theme` opens the picker and Enter sends `syntax theme <name>`.

## Out of scope

- Highlighting in the markdown preview tab's code blocks, the transcript, or the terminal UI — this feature touches only the editor tab.
- Per-tab or per-language theme overrides — one global theme.
- Language auto-detection by content (`highlightAuto`) — extension-based only; extensionless files stay plain.
- Semantic (type-aware) highlighting — hljs is lexical by design.
- Live theme preview while arrowing through the picker (apply-on-Enter only); can be its own follow-up.
- Incremental/windowed tokenization — the debounce + large-file guard is the chosen performance envelope.

## Verification

`./scripts/run.mjs check-diff` after each step. End-to-end: `npm run start`, `edit src/config.ts` → keywords/strings/comments are colored; edit inside a block comment → following lines re-color after the debounce; `open README.md` stays the rendered view while `edit README.md` shows highlighted markdown; `syntax theme nord` → colors change in every open editor tab and the confirmation appears; `.janissary/config.json` now contains `"syntaxTheme": "nord"`; restart → theme survives; `syntax theme` → modal lists themes with `nord` marked, arrow + Enter switches, Escape closes; `syntax theme bogus` → error listing valid names; `edit notes.txt` → plain text, no colors.

## Open questions

- The eight starter themes are placeholders pending a visual check against the app's dark chrome once wired up; the list is data (`SYNTAX_THEMES`), so trimming it later is a one-line change per theme.
