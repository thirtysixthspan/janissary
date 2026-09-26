# technical-debt

## ready

## development

* Finish moving the bundled tab plugins onto the declared intent table, starting with the PDF, video, and audio plugins, so their intent validation comes from the one audited helper rather than a hand-written if-chain each.

Existing Debt: The plugin contract gained `defineIntents` to make the tab-payload guard, the unknown-intent rejection, and the per-intent payload check part of the contract rather than a convention, but only the image plugin adopted it, and eight bundled plugins still hand-roll the same three checks in nested `if` chains that each restate the rejection wording. Severity: 4/10

Existing Risk: 4/10 - Each new intent added to one of those plugins is one forgotten `is…Payload` check away from handing unvalidated client input to a filesystem write or a playlist mutation, which is exactly the hazard the helper was introduced to close, and every plugin written by copying one of them inherits the hand-rolled shape.

Proposal Risk: 2/10 - The three migrated plugins get their checks from the audited helper, but the five remaining hand-rolled plugins keep the hazard until later increments migrate them, and an intent whose `run` needs the raw request still cannot use the table.

Proposal: `defineIntents(pluginId, isPayload, intents)` lives in `src/plugins/define-intents.ts`, is re-exported from `src/plugins/api.ts`, and is used only by `src/plugins/image/activate.ts`. The hand-written `intent` callbacks in `src/plugins/pdf/activate.ts` (`load-failed`), `src/plugins/video/activate.ts` (`capture-frame`, `open-external`), and `src/plugins/audio/activate.ts` (`select-track`, `remove-track`) each narrow `request.tabPayload`, branch on `request.intent`, check the payload guard from their own `shared.ts`, and fall through to an `unknown <id> intent` rejection and an `invalid <id> tab payload` failure — the same messages the helper already produces. Replace each with a `defineIntents` table keyed by intent name, reusing the existing payload guards (`isLoadFailedPayload`, `isCaptureFramePayload`, `isEmptyPayload`, `isSelectTrackPayload`, `isRemoveTrackPayload`) and moving each branch body into its entry's `run`. `src/plugins/pdf/activate.test.ts`, `src/plugins/video/activate.test.ts`, and `src/plugins/audio/activate.test.ts` pin the current replies, including the rejection strings, and must pass unchanged; `src/plugins/define-intents.test.ts` pins the helper. Leave `page`, `markdown`, `schedules`, `sessions`, and `conversations` for a follow-up increment, noting them in the PR.

## deferred

* Move the command bar's server-completion request out of the agent tab body into the command-input feature where the rest of the completion rules live. — deferred: blocked by `ai/tasks/hygiene/improve-modularity.md`, whose Step 6 quality gate requires the target file's FTA score to drop, but extracting the completion request raises `AgentTabBody.tsx` from 52.67 to 53.03 (the new import outweighs the lines removed), so the playbook restores the file.

Existing Debt: §5 (components render, they do not decide) — `web/src/agent-tabs/AgentTabBody.tsx` builds the completion request inline in the JSX it hands `CommandArea` (`complete={async (text, cursor) => { const result = await client.request<CompletionResult>({ method: 'complete', ... }); return result.ok ? result.value : undefined; }}`), so the request shape and the failed-result unwrap live inside the component body. Severity: 4/10

Existing Risk: 4/10 - The unwrap semantics (an `ok: false` result silently completes with nothing) exist nowhere but inside a rendered callback, so a change to the completion contract — caching, aborting a stale request — starts life as JSX in the app's most-churned component, and a regression is a broken typeahead in every agent tab.

Proposal Risk: 2/10 - The request becomes a directly callable function a unit test can pin, but nothing pins the current unwrap until such a test is written, so a transcription slip would land unnoticed until a rendered completion misbehaved.

Proposal: `web/src/agent-tabs/AgentTabBody.tsx` inlines the server completion call. Extract it into a new module beside the command-input feature's existing completion logic — `web/src/agent-tabs/command-input/server-completion.ts` exporting a `completeOnServer(client, text, cursor)` that returns the unwrapped result — and pass `complete={(text, cursor) => completeOnServer(client, text, cursor)}` from the component. Scope the edit to `web/src/agent-tabs/AgentTabBody.tsx` plus the new module: `web/src/agent-tabs/command-input/CommandInput.tsx` keeps its `complete` prop contract, so no other import changes. `web/src/agent-tabs/command-input/CommandInput.test.tsx` stubs `complete` directly and needs no edit. Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `web/src/agent-tabs/AgentTabBody.tsx`.


## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
