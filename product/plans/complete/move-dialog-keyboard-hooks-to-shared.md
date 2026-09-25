# Move the launch-dialog and confirm-dialog keyboard hooks into `web/src/shared`

## Complexity

2/10 — two files move one directory down, three import sites and two internal imports change, and two new colocated test files pin each hook's behavior at its new home. No behavior changes.

## Goal

The shared-primitives relocation (`client-shared-primitives-move.md`) moved `useDialogKeyboard`, `ModalDialog`, and `ConfirmDialogShell` into `web/src/shared/`, but left two hooks built directly on those primitives in the client root: `web/src/use-launch-dialog.ts` (used by `web/src/harness/HarnessLaunchDialog.tsx` and `web/src/ScheduleLaunchDialog/ScheduleDialog.tsx`) and `web/src/useConfirmDialogKeys.ts` (used by `web/src/shared/ConfirmDialogShell.tsx`). So the shared layer reaches back up into the root for its own dialog behavior, and the root keeps looking like a place where generic dialog primitives belong. Both hooks have two or more consumers (or serve a shared module), so by §2 of the React organization guideline they belong in `web/src/shared/`, beside `useDialogKeyboard.ts`.

## Approach

`git mv` both files into `web/src/shared/` with their names unchanged. Fix the imports each file makes and each importer's path. The existing `import-x/no-restricted-paths` zone targets the `./web/src/shared` directory, so it covers the moved hooks with no eslint change; neither hook imports a feature (`use-launch-dialog.ts` imports only `useDialogKeyboard` and the root `ws` client type).

Neither hook has a direct test today, only indirect coverage through the dialogs that use them. Add a colocated test for each at its new location so the move ships with tests that pin what each hook does.

## Implementation

1. `git mv web/src/use-launch-dialog.ts web/src/shared/use-launch-dialog.ts` and `git mv web/src/useConfirmDialogKeys.ts web/src/shared/useConfirmDialogKeys.ts`.
2. Inside the moved files: `./shared/useDialogKeyboard` becomes `./useDialogKeyboard` in both, and `./ws` becomes `../ws` in `use-launch-dialog.ts`.
3. Update the importers: `web/src/harness/HarnessLaunchDialog.tsx` and `web/src/ScheduleLaunchDialog/ScheduleDialog.tsx` change `../use-launch-dialog` to `../shared/use-launch-dialog`; `web/src/shared/ConfirmDialogShell.tsx` changes `../useConfirmDialogKeys` to `./useConfirmDialogKeys`.
4. Add the two test files below.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- **`web/src/shared/useConfirmDialogKeys.test.tsx`**, mirroring `useDialogKeyboard.test.tsx`'s harness-component style: Cancel is selected by default; `y` confirms and `n` cancels; Enter runs Cancel by default; ArrowRight/ArrowLeft toggle the selection so Enter then confirms; Escape cancels.
- **`web/src/shared/use-launch-dialog.test.tsx`**, using a fake client (`{ send } as unknown as JanusClient`, as `HarnessLaunchDialog.test.tsx` does): Escape sends only the close RPC; Enter sends the built `command` RPC and then the close RPC, in that order; Enter sends nothing when `canSubmit` returns false; the submit button is focused on mount when `hadRemembered` is true and is not when it is false.
- `HarnessLaunchDialog.test.tsx`, `ScheduleDialog.test.tsx`, `ConfirmDialog.test.tsx`, and `src/eslint-feature-boundaries.test.ts` must pass unchanged.

## Out of scope

- Renaming either file to a common casing convention (`use-launch-dialog.ts` vs `useConfirmDialogKeys.ts`).
- Any change to either hook's signature or behavior.
- Moving other root modules (`ws.ts` and its cluster) into `shared/`.
- Any `eslint.config.mjs` change; the shared zone already targets the directory.

## Verification

- `./scripts/run.mjs check-diff` passes.
- `git grep` finds no `../use-launch-dialog` or `../useConfirmDialogKeys` import left anywhere under `web/src/`.

## Documentation and specification impact

None. This is a pure file move plus tests; nothing a user can observe changes, so no spec, `help.md`, or user documentation update is needed.
