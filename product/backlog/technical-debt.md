# technical-debt

## ready

* Route the web plugins' fire-and-forget host intents through one helper that records a failure, instead of discarding it with an empty catch.

Existing Debt: Plugin components call the host's `intent()` and throw away the result with `void capabilities.intent(...).catch(() => {})` at roughly eight call sites (`web/src/plugins/page/PageTab.tsx`, `web/src/plugins/launcher/LauncherTab.tsx`, `web/src/plugins/shell/useShellSubmit.ts`, `web/src/plugins/pdf/usePdfDocument.ts`, and others), so there is no single place where an intent failure is observed. Severity: 4/10

Existing Risk: 4/10 - A remembered shell line, a focus request, or a load-failed report that fails (server restarted, intent renamed, payload rejected) vanishes with no trace anywhere, so a broken intent looks like a UI that quietly does nothing.

Proposal Risk: 2/10 - The calls are already fire-and-forget, so the only behavior change is that failures leave one diagnostic line; the risk is noisy logging if a reconnect makes many calls fail at once.

Proposal: Add `fireIntent(capabilities, name, payload)` next to the plugin capability types in `web/src/plugins/` (see `web/src/plugins/api.ts`, whose `intent<Result>(name, payload)` returns a promise) that calls the intent and reports a rejection once through the project's existing client-side error path; look for it first in `web/src/shared/` before adding anything new, and fall back to a single `console.warn` with the intent name if there is none. Replace the `void ....catch(() => {})` sites that call `capabilities.intent(` or an `intent.current(` ref, leaving sites that need the result alone. Keep the helper free of React so it can be tested without a render, with a colocated test that a rejecting intent is reported and does not throw. Existing tests that call these components with a stub `capabilities` must keep passing; run the plugin tests for `page`, `launcher`, `shell`, and `pdf`.


## development

## deferred

## declined
