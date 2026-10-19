# Route diff tab update refusal through plugin failure handling

## Goal

When a plugin tab update produces a payload the host rejects, disable that plugin through the existing failure path. In particular, a refused diff update must not be swallowed while the diff tab continues publishing stale state.

## Change

Pass the host's guarded failure callback into the plugin context. `updateTab` catches only tab-value validation refusals, records the exact reason `produced an invalid tab payload`, disables the plugin, and returns without throwing. Errors from the plugin's update factory continue through the guarded failure boundary unchanged.

Remove the diff publisher's catch-and-ignore wrapper. Its asynchronous recompute can safely call `updateTab` because refusal is now handled by the host capability. Keep the launcher's summarizer catch: it also reports summarization errors unrelated to publishing, while a refused update no longer throws into it.

## Verification and docs

Rewrite the diff refusal test to assert that the host disables the plugin, and add host-level coverage for refusal, tab teardown, and the recorded reason. Update the tab-plugin behavior spec and developer reference. Public help and user documentation do not describe payload validation or this failure edge, so no user-facing documentation change is needed.

Run `./scripts/run.mjs check-diff`.
