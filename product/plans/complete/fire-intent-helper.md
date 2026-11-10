# Route fire-and-forget plugin intents through one failure-recording helper

**Complexity: 2/10** — ~12 added lines, 6 production files edited, 2 requirements, 2 scenarios, 1 new unit (p=4.17)

Web plugin components discard intent failures with `.catch(() => {})` at six sites (`PageTab`, `LauncherTab` twice, `useShellSubmit`, `usePdfDocument`, `AudioTab`), so a refused or failed intent leaves no trace.

## Goal

One helper, `fireIntent(capabilities, name, payload)` in `web/src/plugins/fire-intent.ts`, calls the intent and records a rejection as a single `console.warn` naming the intent. The client has no existing diagnostic path suited to this: `reportFailure` disables the whole plugin, which is wrong for one refused request.

## Approach

1. Add the React-free helper.
2. Replace every `void ....intent(...).catch(() => {})` with `fireIntent`; the pdf hook passes `{ intent: intent.current }`.
3. Leave sites that use the result or surface the error (`RoleCard`, `ModelsTab`, `useShellTabTerminal`) alone.

## Tests

Colocated `fire-intent.test.ts`: success is silent; a rejection is warned once with the intent name and does not throw. Existing plugin tests for `page`, `launcher`, `shell`, `pdf`, `audio` keep passing.

## Out of scope

Sites that never attached a catch, and any user-visible error surface.
