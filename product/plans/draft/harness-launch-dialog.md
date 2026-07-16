# Harness launch dialog

**Complexity: 5/10** — a first-of-its-kind multi-field form dialog on the web side plus a new server-held view threaded into the state snapshot, spanning server and web; de-risked by reusing the existing `command` RPC for the launch itself and the `RouteChooserView` pattern for the view.

## Summary

Running `harness` with no arguments — which today returns the usage error `Usage: harness <claude|opencode|codex> [as <label>] [-w] [-y].` — instead opens a modal **New harness** dialog over the command bar. The dialog is a small form that lets the user pick the harness and set every launch flag (`as <label>`, `-w`/`--workspace`, `--offline`, `-y`/`--yes`, `--model`, `--effort`) through form controls rather than by typing the command by hand. Pressing **Create** launches the harness tab immediately; **Cancel** (or Escape) closes it with nothing launched. The form is populated from a server-delivered catalog of harness names and each harness's known models, and it enforces the flag constraints (`-y` is claude-only and requires `-w`) by disabling controls that would produce an invalid command, so Create can only ever build a valid `harness …` command.

The dialog is a UI convenience layered on top of the existing `harness` command: on Create it synthesizes the equivalent `harness <name> …flags` string and submits it through the normal command path, so all existing parsing, validation, workspace/sandbox setup, creator-transcript recording, and launch behavior are reused unchanged.

## Design decisions

- **Opener.** Typing `harness` with no name opens the dialog instead of returning the usage error. Every other form of the command (`harness claude`, `harness claude -w`, `harness capture <name>`, etc.) is untouched and still launches/acts directly. The dialog can therefore only be opened from a tab that has a command line to type `harness` into; harness tabs, which have no command line, have no way to reach it and need none.
- **Opening the dialog records no transcript line.** The harness command is dispatched in `src/command-manager.ts:78-82` (the `if (/^harness\b/i.test(input))` branch), which appends the raw input to the creator's transcript (`this.managers.tab.append(label, { input, output: '' })`) *before* calling `this.managers.harness.run(input)`. Bare `harness` must be special-cased ahead of that append so opening the dialog leaves no stray `harness` entry behind — see Proposed changes. The launch itself (on Create) still records its full `harness …` line, because Create submits that command back through the normal path.
- **Confirm launches immediately.** Create launches the harness tab right away — it does not populate the command line for review. (This differs from the task/profile/queue pickers, which populate; the user chose immediate launch here.) Internally this is done by submitting the synthesized `harness …` command string, so the launch is identical to typing that command by hand, including the creator-transcript recording described in `harness.md`.
- **All flags exposed.** The form surfaces harness name, `as <label>`, `-w`/`--workspace`, `--offline`, `-y`/`--yes`, `--model`, and `--effort` — the complete flag set from `parseHarnessCommand`.
- **`-y` constraint enforced by the form.** The auto-approve control is disabled unless the selected harness is `claude` **and** the workspace toggle is on. Because the invalid combinations are unreachable, Create never has to surface the `-y/--yes is only supported for the claude harness.` / `-y/--yes requires -w/--workspace…` errors.
- **Model is a strict dropdown; effort is free text.** The Model control is a dropdown of the selected harness's known models (from the server-delivered catalog); when that harness has an empty catalog (today, `codex`), the Model control is disabled and no model is sent. Effort is a free-text field, matching the server's behavior of passing `--effort` through verbatim with no validation.
- **Server-driven catalog.** The list of harness names and the per-harness model catalog are delivered from the server to the client as a view object, rather than duplicating `HARNESS_NAMES`/`harness-models.json` into the web bundle. The client renders whatever the server sent, the same shape as today's `RouteChooserView`.
- **Wording.** Dialog title: **New harness**. Confirm button: **Create**. Cancel button: **Cancel**.
- **Remembered in-memory.** Within a single app run, reopening the dialog restores the previous selections. Nothing is persisted to disk or restored across `--relaunch`.

## What already exists (reuse, don't rebuild)

| Concern | Existing thing to reuse | Where |
| --- | --- | --- |
| Harness names + model catalog | `HARNESS_NAMES` (`src/harness/index.ts:9`), `modelsFor(harness)` (`src/harness/models.ts:5`), `harness-models.json` | `src/harness/index.ts`, `src/harness/models.ts` |
| Command parsing / validation | `parseHarnessCommand` (`src/harness/index.ts:38`); `HarnessManager.run` (`src/harness/manager.ts:55`) which validates the model against the catalog (`isKnownModel`, `:59`) and launches | `src/harness/index.ts`, `src/harness/manager.ts` |
| Harness command dispatch (where the creator-transcript line is recorded) | the `if (/^harness\b/i.test(input))` branch | `src/command-manager.ts:78-82` |
| Server-held modal view exposed to the client via a getter + the state snapshot | `pendingRoute` field + `routeView()` getter (`src/command-manager.ts:12`, `:19-20`), surfaced as `route: controller.routeView()` in the snapshot | `src/command-manager.ts`, `src/state-event.ts:13`, `src/protocol.ts:13`,`:79` |
| Submitting a built command string from the client | `client.send({ method: 'command', params: { text } })` — the same call the transcript's file links already make | `web/src/transcript-line.tsx:98`, `src/protocol.ts:100` |
| Resolving/clearing a server-held modal from the client | `chooseRoute` RPC + its message-handler case | `src/protocol.ts:111`, `src/message-handler.ts` |
| Modal overlay stack above the command bar | `PickerOverlays`, and the `pickerOpen` disable-guard wiring in `AgentTabBody` (`web/src/AgentTabBody.tsx:120`) | `web/src/PickerOverlays.tsx`, `web/src/AgentTabBody.tsx` |
| Confirm/cancel dialog shell + keyboard | `ConfirmDialogShell`, `useDialogKeyboard` | `web/src/ConfirmDialogShell.tsx`, `web/src/useDialogKeyboard.ts` |
| Building the launch command string | `buildHarnessCommand` (model/effort `shellQuote`ing) as a reference for assembling the full flagged string | `src/harness/index.ts:79` |

## Proposed changes

**Protocol (`src/protocol.ts`).** Add a `HarnessLaunchView` type describing the dialog's data: the ordered list of harness names and, for each, its model catalog (a `names: string[]` plus a `models: Record<string, string[]>`). Add a nullable `harnessLaunch: HarnessLaunchView | null` field to the `t: 'state'` snapshot type (`:79`) alongside the existing `route`. Add one client→server RPC to `RpcCall` (near `chooseRoute`, `:111`), e.g. `{ method: 'closeHarnessLaunch'; params?: Record<string, never> }`, to clear the server-held view. No launch RPC is needed — Create reuses the existing `command` RPC (`:100`).

**Server-held pending state + getter (`src/harness/manager.ts` + `src/controller.ts` + `src/state-event.ts`).** Model the open/closed dialog exactly like `command-manager`'s `pendingRoute`: hold a boolean/flag on `HarnessManager` (set when the dialog opens, cleared on launch or cancel), and expose a `harnessLaunchView()` getter that returns `null` when closed and, when open, the `{ names, models }` object built from `HARNESS_NAMES` and `modelsFor(name)` for each name. Surface it in `buildStateEvent` (`src/state-event.ts:13`) as `harnessLaunch: controller.harnessLaunchView()`, mirroring the existing `route: controller.routeView()`, with a thin `controller.harnessLaunchView()` delegating to the manager (mirroring `controller.routeView()`). Because the catalog is only serialized while the dialog is open, the static catalog is not sent on every snapshot.

**Bare-`harness` dispatch (`src/command-manager.ts:78-82`).** In the harness branch, detect an args-less `harness` (its `input` trimmed to just `harness`) *before* the `append(label, { input, output: '' })` call, and instead open the dialog (set the manager's pending flag and emit a state change) and return — so no transcript line is recorded. All other `harness …` inputs keep today's append-then-`run` behavior unchanged. `parseHarnessCommand` already returns the same `{ error }` shape for bare `harness` as for a malformed command, so the empty-args discrimination must live here (or be a distinct method on the manager), not be inferred from the parser's error.

**Clearing the view.** The `closeHarnessLaunch` RPC (handled in `src/message-handler.ts` next to `openFileNavigatorFor`, `:77`) clears the manager's pending flag and emits a state change. Cancel/Escape sends it directly; Create sends the `command` RPC with the built string and then `closeHarnessLaunch` (or the command dispatch clears the flag when a `harness <name>` launch runs) so the dialog closes as the tab opens.

**Client state (`web/src/useServerState.ts`, `web/src/App.tsx`).** Thread the `harnessLaunch` view from the state snapshot into React state next to `route` (App.tsx already holds `route`/`routeReference` — mirror that), passing it down through `AgentTabBody`/`PickerOverlays` to the dialog.

**Dialog component (`web/src/HarnessLaunchDialog.tsx`, new).** A form dialog rendering: a harness selector (the delivered `names`), a `Label` text input (maps to `as <label>`), `Workspace` / `Offline` / `Auto-approve` checkboxes, a `Model` dropdown (options from `models[selectedHarness]`, disabled when empty), and an `Effort` text input. It holds the in-memory remembered selections. It derives the disabled state of the Auto-approve control from `harness === 'claude' && workspace`. On Create it composes the `harness <name> …flags` string (name; `as <label>` when a label is set; `-w`, `--offline`, `-y` for their toggles; `--model <value>`; `--effort <value>`), submits it via the `command` RPC, and clears the view; on Cancel/Escape it clears the view via the close RPC. Keep the file within the 200-line limit — factor the command-string assembly into a small helper module (e.g. `web/src/harness-launch-command.ts`) if needed, and reuse `ConfirmDialogShell`/`useDialogKeyboard` for the button row and Enter/Escape handling.

**Overlay wiring (`web/src/PickerOverlays.tsx`, `web/src/AgentTabBody.tsx`).** Add the dialog to the mutually-exclusive overlay stack and include it in the `pickerOpen`-style guard so the command line and other shortcuts are suppressed while it is open, consistent with the other overlays.

**Command-string helper (`web/src/harness-launch-command.ts`, new — optional).** Pure function turning the form's field values into the `harness …` command string, unit-testable in isolation, mirroring the server-side `buildHarnessCommand` quoting approach for `--model`/`--effort` values that contain spaces.

## Tests

- **`web/src/harness-launch-command.test.ts`** (new, if the helper is extracted) — the field-values → command-string mapping: name only; each flag individually; label with a space; model and effort; and that an invalid combination (e.g. `-y` without `-w`) is never produced because the form gates it.
- **`web/src/HarnessLaunchDialog.test.tsx`** (new) — rendering from a delivered catalog; the Auto-approve control is disabled unless claude + workspace; the Model dropdown is disabled for a harness with an empty catalog; Create submits the expected `command` RPC text and closes; Cancel/Escape closes without submitting; remembered selections are restored on reopen within the run.
- **Server dispatch test (`src/command-manager.test.ts`)** — bare `harness` opens the dialog (`harnessLaunchView()` becomes non-null) and records **no** transcript entry in the issuing tab; `harness claude` and other non-empty forms still append + run as before; `closeHarnessLaunch` clears the view back to `null`.
- **Manager view test (`src/harness/manager.test.ts`)** — `harnessLaunchView()` returns `null` when closed and the `{ names, models }` catalog (built from `HARNESS_NAMES`/`modelsFor`) when open, including an empty model list for `codex`.
- Follow the colocated `*.test.ts(x)` convention (vitest `server`/`client` projects) already used in each area.

## Out of scope

- Persisting the dialog's selections to disk or restoring them across `--relaunch` (remembered in-memory only).
- Validating `--effort` values against any fixed set (passed through verbatim, unchanged from today).
- Opening the dialog from a harness tab or via a dedicated keybinding — the only opener is bare `harness` from a tab with a command line.
- Any change to how `harness capture <name>`, `profile launch`, or explicit `harness <name> …` commands behave.
- Extending `-y`/model support to opencode/codex beyond what already exists.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks the affected projects, and runs the affected server and web tests.
- Manual: run the app, type `harness` alone in an agent tab's command line, and confirm the **New harness** dialog opens; verify Auto-approve is disabled until claude + Workspace are both set, that the Model dropdown lists claude/opencode models and is disabled for codex, that Create opens a harness tab matching the chosen flags (and records the equivalent `harness …` line in the creator transcript), and that Cancel/Escape closes it with no tab created. Reopen the dialog and confirm the previous selections are restored.
