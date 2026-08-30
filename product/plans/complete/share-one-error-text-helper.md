# Share one `errorText` helper across the server and the web client

**Complexity: 4/10** — one new eight-line module and a mechanical substitution at twenty-six call sites across two apps. No new architecture, no wire-protocol change, no behavior a user can observe changes.

`error instanceof Error ? error.message : String(error)` is written out twenty-six times across `src/` and `web/src/`. Eight of those are named local functions with identical bodies — `errorMessage` in `src/database/index.ts` and `src/database/query.ts`, `toMessage` in `src/git-sync.ts`, `errorText` in `src/message-handler.ts`, the private `errorText` method on `RemoteFileNavigators` in `src/remote/serve-file-navigator.ts`, and the same expression opening `pluginFailureReason` in `src/plugins/failure.ts`, `reasonFor` in `web/src/plugins/PluginBody.tsx`, and `failureReason` in `web/src/editor/plugins/host.ts`. The remaining eighteen are the bare expression inlined into a template literal, an argument, or a `const`.

Every one of them answers the same question — how an unknown throw is rendered as text for a human — and answering it in twenty-six places means the next change to that answer (trimming a stack suffix, unwrapping a `cause`, handling a thrown string that already reads as a sentence) lands in one of them and silently disagrees with the other twenty-five.

## Goal

One exported `errorText(error: unknown): string`, imported by both apps, with no copy of the expression left anywhere in `src/` or `web/src/`.

## Design decisions

**It lives in `src/error-text.ts`, and the client reaches it through `@shared/`.** The repo already has a convention for a module both apps import: a file at the `src/` root, reached from the web client through the `@shared/*` → `../src/*` alias declared in `web/tsconfig.json` and `web/vite.config.ts`. `search-matches.ts`, `app-themes.ts`, `syntax-themes.ts`, and `config.ts` are all reached that way, and several of those exports are values rather than types, so a runtime import over that alias is already proven. A new `web/src/`-side copy would leave the duplication in place across the boundary, which is the thing this item exists to remove.

**The name is `errorText`.** Four names are in play for the same function (`errorMessage`, `toMessage`, `errorText`, `reasonFor`). `errorText` is what `src/message-handler.ts` and `RemoteFileNavigators` already call it, and it is the name the backlog item asks for.

**The two first-line trimmers keep their own function and call `errorText` inside it.** `pluginFailureReason` and `failureReason` do more than render the throw — they take the first line, strip trailing punctuation, and fall back to `'Unknown failure'`. Only their first statement is the duplicate. They keep their identity and their callers, and their bodies start from `errorText(error)`.

**`src/startup-errors.ts` and `src/plugins/context.ts` are not call sites.** `maybeStack` reads `error.stack`, not `.message`, and `context.ts` re-throws a value as an `Error` rather than rendering it. Neither is the expression this item is about; both are left alone.

**No behavior changes at any site.** The shared function's body is character-for-character the expression it replaces, so every message every site produces today is the message it produces after.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The `@shared/*` → `../src/*` path alias | `web/tsconfig.json:13`, `web/vite.config.ts:13` |
| A precedent for a runtime (non-type) import over that alias | `@shared/search-matches`, `@shared/app-themes`, `@shared/syntax-themes` |
| The name the helper should have | `src/message-handler.ts:11`, `src/remote/serve-file-navigator.ts:180` |
| The first-line trimming both plugin hosts do on top of it | `src/plugins/failure.ts:8`, `web/src/editor/plugins/host.ts:33` |

## Implementation steps

1. **New module `src/error-text.ts`.** Export `errorText(error: unknown): string` returning `error instanceof Error ? error.message : String(error)`.

2. **Replace the eight named local helpers.** In `src/database/index.ts`, `src/database/query.ts`, `src/git-sync.ts`, and `src/message-handler.ts`, delete the local function and import `errorText` from `./error-text.js` (or `../error-text.js`), renaming the call sites that used `errorMessage`/`toMessage`. In `src/remote/serve-file-navigator.ts`, delete the private `errorText` method and its `this.` call prefixes in favour of the import. In `src/plugins/failure.ts` and `web/src/editor/plugins/host.ts`, keep the wrapper and replace only its first statement. In `web/src/plugins/PluginBody.tsx`, delete `reasonFor` and call `errorText` directly.

3. **Replace the eighteen inline expressions.** `src/monitor/manager.ts`, `src/main.ts`, `src/global-history.ts` (two), `src/transcript/store.ts`, `src/workspace/manager.ts`, `src/workspace/provision-wire.ts`, `src/tab/persistence.ts`, `src/cli-args.ts`, `src/browser/tab.ts` (two), `src/profile/manager.ts`, `src/chrome-extension-loader.ts`, `src/index.ts`, `src/command/manager.ts`, `src/acp/index.ts`, `src/editor/save.ts`, `src/remote/serve.ts` — each becomes `errorText(error)` with the import added.

4. **Import extensions.** Relative imports in `src/` carry `.js`; the two web files import from `@shared/error-text` with no extension.

## Tests

- New `src/error-text.test.ts`, mirroring the style of the existing colocated server tests: an `Error` yields its `message`; a subclass of `Error` yields its `message`; a thrown string yields itself; a thrown object yields its `String()` form; `undefined` and `null` yield `'undefined'` and `'null'`; an `Error` with an empty message yields the empty string.
- The existing suites covering the touched call sites must pass unchanged — they are the check that no site's rendered message moved. `./scripts/run.mjs check-diff` runs the affected ones.

## Out of scope

- **Merging `pluginFailureReason` and `failureReason` into one shared trimmer.** They are a second, narrower duplication with its own boundary question (the client's editor plugin host would have to import from `src/plugins/`), and folding it in here would widen a mechanical substitution into a plugin-layer decision.
- **Changing any message text**, adding `cause` unwrapping, or trimming stacks. This change is behaviour-preserving; improving the rendering is a separate item.
- **`maybeStack` in `src/startup-errors.ts`** and the re-throw in `src/plugins/context.ts`, neither of which renders a message.
- **A lint rule banning the inline expression.** Worth considering once the copies are gone, but it is a repo-wide config change rather than this fix.
