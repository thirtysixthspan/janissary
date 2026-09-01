# Move the "New schedule" launch dialog out of the schedules plugin

## Complexity

6/10 — four files move into a new host directory, a hand-rolled lifecycle hook is replaced by two shared ones, the dialog's props change shape, and an ESLint zone plus its boundary test are extended.

## Goal

The schedule launch dialog is rendered only by the app shell and nothing inside the schedules plugin imports it, yet it lives in the plugin's directory, where the plugin import boundary forbids reaching host modules. So it carries a private `useScheduleDialogLifecycle` that reproduces the shared `useDialogKeyboard` line for line — focus on mount, capture-phase keydown, click-outside swallow, ref-refreshed handler — which is §2 failing because the file sits where the shared module cannot be reached. The two copies of the modal key trap drift silently: a fix to the shared hook reaches every dialog in the app except this one, and no test fails to say so. The static app-shell import also folds the plugin's dialog and its command builder into the entry chunk the lazy loader map exists to keep them out of.

Move the dialog to host code, where it may import host modules, and delete the duplication.

## Approach

**Move.** `ScheduleDialog.tsx`, `schedule-command.ts`, and their colocated tests go into `web/src/ScheduleLaunchDialog/`, a host directory of its own following the `web/src/QuitDialog/` and `web/src/SaveChangesDialog/` convention. The file and component names stay as they are. Add `ScheduleLaunchDialog` to `clientFeatureDirectories` in `eslint.config.mjs` so the feature zones cover it.

**Adopt the shared hook.** `useLaunchDialog` in `web/src/use-launch-dialog.ts` already types its `closeMethod` parameter as `'closeHarnessLaunch' | 'closeScheduleLaunch'` — it was written to serve both launch dialogs and only the import boundary kept this one away from it. It gives exactly what `useScheduleDialogLifecycle` hand-rolls: `useDialogKeyboard` for the key trap and click-outside swallow, Escape/Enter handling with an optional `canSubmit` gate, the remembered-selection submit focus, and `cancel`/`create` callbacks. Delete `useScheduleDialogLifecycle` and call `useLaunchDialog(client, 'closeScheduleLaunch', fields, buildScheduleCommand, hadRemembered, isValid)`.

**Take `view` and `client`, not `onSubmit`/`onCancel`.** `useLaunchDialog` sends the RPCs itself, so the two `client.send` calls currently written in `AppMain.tsx`'s JSX move into the dialog. The result is the same wire traffic in the same order — `command` then `closeScheduleLaunch` on create, `closeScheduleLaunch` alone on cancel — and it makes the component's shape identical to `HarnessLaunchDialog`, which `AppMain.tsx` renders directly beside it as `<HarnessLaunchDialog view={harnessLaunch} client={client} />`. This is the second option the backlog entry offers, and it is the one that leaves no props-vs-RPC asymmetry between the two launch dialogs.

The module-level `remembered` field and the `resetScheduleDialogMemory` export move as they are.

## Implementation

1. `git mv` `ScheduleDialog.tsx`, `ScheduleDialog.test.tsx`, `schedule-command.ts`, and `schedule-command.test.ts` from `web/src/plugins/schedules/` into a new `web/src/ScheduleLaunchDialog/`. The `./schedule-command` imports inside the moved files stay correct.
2. Add `'ScheduleLaunchDialog'` to `clientFeatureDirectories` in `eslint.config.mjs`.
3. In `ScheduleDialog.tsx`: change `Properties` to `{ view: ScheduleLaunchView; client: JanusClient }`, importing the view type from `@shared/protocol` and the client type from `../ws`. Read `view.targets` and `view.active` where `targets` and `activeTarget` were read. Replace the `useScheduleDialogLifecycle` call with `useLaunchDialog(client, 'closeScheduleLaunch', fields, buildScheduleCommand, hadRemembered, isValid)`, wire Cancel to the returned `cancel`, and delete the `useScheduleDialogLifecycle` function together with its now-unused `useEffect`/`useRef` imports.
4. In `AppMain.tsx`: import from `./ScheduleLaunchDialog/ScheduleDialog` and render `<ScheduleDialog view={scheduleLaunch} client={client} />`, dropping the two inline `client.send` calls.
5. Run `./scripts/run.mjs check-diff` after each step.

## Tests

- **`web/src/ScheduleLaunchDialog/ScheduleDialog.test.tsx`** travels with the module and is rewritten onto a fake client, mirroring `HarnessLaunchDialog.test.tsx`'s `makeClient()` helper. Every existing case is kept — per-type field visibility, the four per-type validation gates, the composed command, the `in TAB` clause, Cancel, Escape, click-outside, remembered restore, and both submit-focus cases — with `onSubmit`/`onCancel` assertions restated as `send` assertions: `{ method: 'command', params: { text } }` first, then `{ method: 'closeScheduleLaunch', params: {} }`.
- **One new case**: Enter with a valid form submits the composed command, and Enter with an invalid form sends nothing. The old lifecycle hook had that gate and no test covered it; `useLaunchDialog`'s `canSubmit` is where it now lives.
- **`web/src/ScheduleLaunchDialog/schedule-command.test.ts`** moves unchanged.
- **`src/eslint-feature-boundaries.test.ts`** gains a case proving the new directory participates in sibling isolation: an import of `../harness/HarnessTab` from `web/src/ScheduleLaunchDialog/ScheduleDialog.tsx` is rejected with the sibling-feature message.

## Out of scope

- The schedules plugin's own `DeleteScheduleDialog.tsx`, which still hand-rolls its dialog behavior with no shared hook it may import. A second copy can appear there on the same reasoning, but it is a separate item — it is genuinely plugin code and cannot simply move out.
- Renaming the `ScheduleDialog` component or its file to match the directory name.
- Any change to `useDialogKeyboard` or `useLaunchDialog` themselves.
- Server-side schedule parsing, validation, or firing — the dialog still submits an ordinary `schedule …` command string through the normal command path.
- The plugin lazy-loader map and chunk boundaries beyond the improvement that falls out of the app shell no longer statically importing a plugin-directory module.

## Verification

- `./scripts/run.mjs check-diff` passes.
- `grep` shows no `plugins/schedules/ScheduleDialog` import anywhere and no `useScheduleDialogLifecycle` left in the tree.
- The moved suite's create case asserts the same two RPCs, in the same order, that `AppMain.tsx` sent before.

## Documentation and specification impact

None. The dialog looks and behaves exactly as it does today — same fields, same validation, same keys, same commands. Nothing a user can observe changes.
