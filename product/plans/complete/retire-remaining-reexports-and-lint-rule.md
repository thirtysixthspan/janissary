# Retire the remaining server re-exports and enforce the direct-import guideline

**Complexity: 5/10** — import-path rewriting across about twenty re-export sites and every server file and test that imports through them, one decision about `src/protocol.ts`, and a new lint rule. No behavior, wire, client, or command change; the typechecker verifies every rewritten import and the lint rule verifies nothing was left behind.

The first increment cleared `src/tab/`, `src/schedule/`, `src/notifications/`, and `src/recognizers/`. About twenty other server modules still carry `export { … } from` lines that file-size extractions left behind, and nothing in `eslint.config.mjs` stops a new one, so each split re-exports again and callers keep reaching through the old home. Two sites the first increment missed are in the same shape: `src/tab/creators.ts` re-exports the three `unique*Label` helpers, and `src/tab/transcript/operations.ts` is a renaming layer over `./events.js` whose only consumer is `src/tab/transcript/state.ts`.

## Goal

No server module outside the three exempt entry points carries an `export … from` declaration, every importer names the file that defines the symbol, and ESLint fails on any new re-export in `src/`.

## Approach

For each re-exported symbol, rewrite its importers (production and tests, `vi.mock` paths included) to the defining file with a `.js` extension, then delete the re-export line. Where the old home still uses the symbol, keep a plain `import`. A renaming re-export means callers adopt the defining name.

The rewriting is mechanical, so a one-off codemod (kept outside the repo) reads each server file with the TypeScript parser, finds import declarations that resolve to an old home and name a moved symbol, and splits those names into an import from the defining file, merging into an existing import from that file when there is one. Namespace imports, `vi.mock` paths, and `import('…')` type queries are checked by hand.

Sites and their defining files:

- `src/client-message.ts` → `client-params/plugin.ts`, `client-params/editor.ts`
- `src/database/index.ts` → `database/parsing.ts`, `database/primer.ts`
- `src/monitor/manager.ts` → `monitor/suggestion.ts`, `monitor/live-monitors.ts`
- `src/monitor/window.ts` → `monitor/suggestions.ts`
- `src/monitor/parsing.ts` → `monitor/reply-format.ts`
- `src/file-navigator/index.ts` → `file-navigator/git-mark.ts`
- `src/completion/handlers.ts` → `completion/browser.ts`, `completion/target-handlers.ts`
- `src/controller/file/navigator.ts` → `navigator-selection.ts`, `navigator-commit.ts`
- `src/cli-args.ts` → `cli-info.ts`
- `src/harness/busy-status.ts` → `harness/busy-classify.ts`
- `src/harness/index.ts` → `harness/command-parse.ts`
- `src/personas.ts` → `persona-parsing.ts`
- `src/plugins/failure.ts` (`errorFirstLine` renamed `pluginFailureReason`) → `error-text.ts`, callers use `errorFirstLine`
- `src/plugins/host.ts` → `plugins/status.ts`
- `src/openers/index.ts` → `openers/types.ts`
- `src/commands/index.ts` → `commands/types.ts`
- `src/remote/manager.ts` → `remote/entry-factory.ts`
- `src/remote/channel/index.ts` → `channel/capture.ts`, `channel/sessions.ts`, `channel/acp.ts`, `channel/types.ts`
- `src/remote/protocol.ts` → `remote/protocol-frames.ts`
- `src/tab/creators.ts` → `tab/unique-labels.ts`
- `src/tab/transcript/operations.ts` → `transcript/events.ts`, `transcript/log.ts`, `tab/history.ts`; `state.ts` calls `startRunningTab`, `finishRunningTab`, `updateRunningEntry`, `clearTranscriptTab`, `capLog`, and `recordHistory` by their defining names. What remains of `operations.ts` is `append`, a two-call composition of `appendTab` and `markUnreadTab` whose only caller is `state.ts`, so it moves into `state.ts`'s own `append` method and `operations.ts` is deleted.

### Decision: `src/protocol.ts` stays an exempt entry point

`src/protocol.ts` re-exports wire types from `./tab/types.js`, `./completion/types.js`, `./profile/types.js`, and `./protocol/*.js`. It is the single wire contract (architecture principle 7), and the client reaches it through `@shared/protocol` in about 170 imports. Pointing the client at the internal files would spread the wire contract across a dozen server paths and couple client code to server file layout, which is what the single contract exists to prevent. So it is exempt, like the published plugin contract, and the decision is recorded in `ai/guidelines/imports-and-barrel-files.md`. Server code still imports each wire type from its defining file where it already does; that is not changed here.

Rejected alternative: have the client import `@shared/tab/types`, `@shared/protocol/*`, and so on directly. It removes one exemption but spreads the contract, adds churn to about 170 client imports, and gains nothing a compile error does not already catch.

### Lint rule

Add a `no-restricted-syntax` config for `src/**/*.ts` and `src/**/*.tsx` banning `ExportNamedDeclaration[source]` and `ExportAllDeclaration`, with a message pointing at the guideline, exempting `src/protocol.ts`, `src/plugins/api.ts`, and `src/plugins/fixture-v1/activate.ts`. No other config sets `no-restricted-syntax`, so it overrides nothing.

## Implementation steps

1. Run the codemod over `src/` for every site above except the two renaming ones, then delete each re-export line, keeping a plain import where the old home still uses the symbol.
2. Hand-rewrite the renaming sites: `pluginFailureReason` callers (`src/plugins/host.ts`, `src/plugins/failure.test.ts`) and `src/tab/transcript/state.ts`; fold `append` into `state.ts`, delete `src/tab/transcript/operations.ts`, and point the stale `transcript-operations.ts` reference in `src/tab/lookup.ts` at `transcript/events.ts`.
3. Check `vi.mock`, `vi.importActual`, namespace imports, and `import('…')` type queries that name an old home and a moved symbol. `src/controller/file/navigator-adapter.ts` reaches `./navigator.js` through a namespace import, so its four calls to the selection and commit functions import them from `navigator-selection.js` and `navigator-commit.js` by name.
4. Add the lint rule and record the `src/protocol.ts` decision in `ai/guidelines/imports-and-barrel-files.md`.
5. Run `./scripts/run.mjs check-diff` after each step and lint all of `src/` once for the new rule.

## Tests

No behavior changes, so the existing suites are the check: a missed importer of a deleted re-export fails to compile, each rewritten test must pass unchanged apart from its import lines, and the lint rule fails on any re-export left behind.

## Spec

None — a refactor with no user-visible change.

## Out of scope

- `src/plugins/api.ts` (the published plugin contract), `src/plugins/fixture-v1/activate.ts` (the frozen compatibility fixture), and `src/protocol.ts` (the wire contract), which stay exempt.
- `web/src/`, which imports none of the affected modules.
- The completion-cursor backlog item, which reshapes the completion handlers; this change only moves their imports.
