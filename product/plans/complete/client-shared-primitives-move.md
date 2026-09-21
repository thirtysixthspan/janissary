# Move the client's shared UI primitives into `web/src/shared`

**Complexity: 4/10** — a pure file move plus import-path fixes across roughly fifty importers, guided
mechanically by the compiler. No behavior changes anywhere, no design decisions, and the enforcing
eslint zone (`import-x/no-restricted-paths` targeting `./web/src/shared`) already exists and needs no
edit — it targets the directory, not a list of files, per `eslint.config.mjs`.

`web/src` has two shared layers: `web/src/shared/` (covered by the zone that forbids importing a
feature) and a set of flat modules at the client root that features import directly (uncovered). Eight
root modules are imported by two or more feature directories — `icons.ts` (22 importers across
`file-navigator`, `pickers`, `editor`, plus root/shared files and `plugins/api.ts`),
`drop-handles.ts` (14), `tab-handles.ts` (14), `ModalDialog.tsx` (4), `useDialogKeyboard.ts` (5),
`SplitTabButton.tsx` (4), `InlineEditInput.tsx` (4), `ConfirmDialogShell.tsx` (3) — and moving them
under the zone closes the boundary hole for exactly the modules the entry names.

## Goal

`icons.ts`, `drop-handles.ts`, `ModalDialog.tsx`, `useDialogKeyboard.ts`, `tab-handles.ts`,
`InlineEditInput.tsx`, `SplitTabButton.tsx`, and `ConfirmDialogShell.tsx` live in `web/src/shared/`,
together with their colocated tests (`drop-handles.test.ts`, `tab-handles.test.ts`,
`useDialogKeyboard.test.tsx`, `SplitTabButton.test.tsx`). Every importer's path is updated. Nothing
about what any of these modules export or how they behave changes — verified by every moved module's
own test passing unchanged, and by `web/src/App.test.tsx` and
`src/eslint-feature-boundaries.test.ts` passing unchanged.

## Approach

1. **`git mv` each file and its colocated test** into `web/src/shared/`, preserving history.
2. **Fix every import**, guided by `tsc`'s "cannot find module" errors rather than a blind
   find-and-replace — the correct relative path depends on the importing file's own directory depth
   (a root file's `./icons` becomes `./shared/icons`; a feature file's `../icons` becomes
   `../shared/icons`; a file already inside `web/src/shared/` importing one of these siblings drops a
   `../` level entirely, since both now live in the same directory).
3. **Update the two re-export lines in `web/src/plugins/api.ts`** (`InlineEditInput`, the three icon
   exports) to point at `../shared/InlineEditInput` and `../shared/icons`.
4. **Leave `web/src/ws.ts` and its owned cluster where they are** — `ws-connection.ts`,
   `pty-output-buffer.ts`, `reconnect-policy.ts`, `client-state-collectors.ts` — per the entry, that is
   a larger later increment (thirty-two importers) and out of scope here.

## Implementation steps

1. Move the eight files and four colocated tests with `git mv`.
2. Run `npx tsc --noEmit -p web` (or the project's equivalent) and fix each reported import path, file by file, until it compiles clean.
3. Update the two re-export lines in `web/src/plugins/api.ts`.
4. Run `check-diff`; run the full web test suite once as a final check, since the moved files' tests and every importer's tests are affected by path changes the diff-scoped run might not catch in full.

## Tests

No new test cases — this is a pure move. Every moved file's own test (`drop-handles.test.ts`,
`tab-handles.test.ts`, `useDialogKeyboard.test.tsx`, `SplitTabButton.test.tsx`) must pass unchanged
from its new location, and every importer's existing tests must keep passing. `web/src/App.test.tsx`
and `src/eslint-feature-boundaries.test.ts` (which pins how the zones are constructed) must pass
unchanged, confirming the zone itself needed no edit.

## Out of scope

- `web/src/ws.ts` and the modules it owns (`ws-connection.ts`, `pty-output-buffer.ts`,
  `reconnect-policy.ts`, `client-state-collectors.ts`) — a separate, larger increment the entry itself
  defers.
- Any change to `eslint.config.mjs` — the zone already targets the directory.
- Any change to what these modules export or how any of them behaves.
