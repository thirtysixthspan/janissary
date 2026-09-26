# technical-debt

## ready

## development

* Reduce the cognitive complexity of `runConversationIntent()` in `src/plugins/conversations/activate.ts` (line 116), reported at 16 against the allowed 15 in a file scoring 54.11 FTA across 153 lines. The function is a flat `switch` over the conversation tab's intents in which every arm repeats the same two-step shape — reject the request with `invalid <intent> payload` when that intent's payload guard fails, then emit one `capabilities.topicAction` call — so each intent writes its guard and its dispatch separately and a new intent means writing both halves again. The shared rejection and the arm that `open-files` and `launch-agent` already share are self-contained enough to lift into a local helper and a single arm without touching the file's exports. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `runConversationIntent()` in `src/plugins/conversations/activate.ts`. Severity: **low**.


## deferred

* Move the command bar's server-completion request out of the agent tab body into the command-input feature where the rest of the completion rules live. — deferred: blocked by `ai/tasks/hygiene/improve-modularity.md`, whose Step 6 quality gate requires the target file's FTA score to drop, but extracting the completion request raises `AgentTabBody.tsx` from 52.67 to 53.03 (the new import outweighs the lines removed), so the playbook restores the file.

Existing Debt: §5 (components render, they do not decide) — `web/src/agent-tabs/AgentTabBody.tsx` builds the completion request inline in the JSX it hands `CommandArea` (`complete={async (text, cursor) => { const result = await client.request<CompletionResult>({ method: 'complete', ... }); return result.ok ? result.value : undefined; }}`), so the request shape and the failed-result unwrap live inside the component body. Severity: 4/10

Existing Risk: 4/10 - The unwrap semantics (an `ok: false` result silently completes with nothing) exist nowhere but inside a rendered callback, so a change to the completion contract — caching, aborting a stale request — starts life as JSX in the app's most-churned component, and a regression is a broken typeahead in every agent tab.

Proposal Risk: 2/10 - The request becomes a directly callable function a unit test can pin, but nothing pins the current unwrap until such a test is written, so a transcription slip would land unnoticed until a rendered completion misbehaved.

Proposal: `web/src/agent-tabs/AgentTabBody.tsx` inlines the server completion call. Extract it into a new module beside the command-input feature's existing completion logic — `web/src/agent-tabs/command-input/server-completion.ts` exporting a `completeOnServer(client, text, cursor)` that returns the unwrapped result — and pass `complete={(text, cursor) => completeOnServer(client, text, cursor)}` from the component. Scope the edit to `web/src/agent-tabs/AgentTabBody.tsx` plus the new module: `web/src/agent-tabs/command-input/CommandInput.tsx` keeps its `complete` prop contract, so no other import changes. `web/src/agent-tabs/command-input/CommandInput.test.tsx` stubs `complete` directly and needs no edit. Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `web/src/agent-tabs/AgentTabBody.tsx`.


## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
