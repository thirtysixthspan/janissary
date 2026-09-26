# technical-debt

## ready

## development

* Stop walking the task and profile directories on every state broadcast by caching those listings and refreshing them on a short interval.

Existing Debt: `buildStateEvent` runs a recursive `readdirSync` walk of `ai/tasks` in both the project and the janissary install, plus two profile directory listings, synchronously inside every state broadcast, and the broadcast fires on essentially every mutation including each chunk of shell and ACP output. Severity: 5/10

Existing Risk: 4/10 - Streaming output and keystrokes each pay several synchronous filesystem walks on the event loop that serves every tab, so a project with a deep `ai/tasks` tree or a slow disk turns into visible input lag across the whole app, and the constantly rebuilt rows are also what shift an open picker's selection.

Proposal Risk: 2/10 - A task or profile created on disk takes up to the cache interval to appear in its picker, which is the one behavior a user could notice.

Proposal: `buildStateEvent` in `src/state-event.ts` includes `tasks: listTasks(controller.rootDir)` and `profiles: listProfileRows()`, where `listTasks` in `src/tasks.ts` recursively walks `ai/tasks` under the project and `janissaryRoot()`, and `listProfileRows` in `src/profiles.ts` lists two profile directories; `emitState` in `src/index.ts` calls `buildStateEvent` for every `state:dirty` event wired in `src/controller/events.ts`. Add `src/state-listings.ts` exporting `cachedTasks(projectDir, now = Date.now)` and `cachedProfileRows(now = Date.now)` that return the previous result when it is younger than a `LISTING_TTL_MS` (1000 ms) and recompute otherwise, keyed on `projectDir` for tasks, and use them in `buildStateEvent`; leave `listTasks` and `listProfileRows` unchanged for their other callers such as `profileNames`. Both pickers open client-side from rows already in the last snapshot, so the one-second window is the whole cost; record it in `product/specs/task-picker.md` and `product/specs/profiles.md`. There is no test for `src/state-event.ts`; add `src/state-listings.test.ts` with an injected clock asserting one walk per interval and a recompute after it, and keep `src/tasks.test.ts` and `src/profiles.test.ts` passing unchanged.

## deferred

* Move the command bar's server-completion request out of the agent tab body into the command-input feature where the rest of the completion rules live. — deferred: blocked by `ai/tasks/hygiene/improve-modularity.md`, whose Step 6 quality gate requires the target file's FTA score to drop, but extracting the completion request raises `AgentTabBody.tsx` from 52.67 to 53.03 (the new import outweighs the lines removed), so the playbook restores the file.

Existing Debt: §5 (components render, they do not decide) — `web/src/agent-tabs/AgentTabBody.tsx` builds the completion request inline in the JSX it hands `CommandArea` (`complete={async (text, cursor) => { const result = await client.request<CompletionResult>({ method: 'complete', ... }); return result.ok ? result.value : undefined; }}`), so the request shape and the failed-result unwrap live inside the component body. Severity: 4/10

Existing Risk: 4/10 - The unwrap semantics (an `ok: false` result silently completes with nothing) exist nowhere but inside a rendered callback, so a change to the completion contract — caching, aborting a stale request — starts life as JSX in the app's most-churned component, and a regression is a broken typeahead in every agent tab.

Proposal Risk: 2/10 - The request becomes a directly callable function a unit test can pin, but nothing pins the current unwrap until such a test is written, so a transcription slip would land unnoticed until a rendered completion misbehaved.

Proposal: `web/src/agent-tabs/AgentTabBody.tsx` inlines the server completion call. Extract it into a new module beside the command-input feature's existing completion logic — `web/src/agent-tabs/command-input/server-completion.ts` exporting a `completeOnServer(client, text, cursor)` that returns the unwrapped result — and pass `complete={(text, cursor) => completeOnServer(client, text, cursor)}` from the component. Scope the edit to `web/src/agent-tabs/AgentTabBody.tsx` plus the new module: `web/src/agent-tabs/command-input/CommandInput.tsx` keeps its `complete` prop contract, so no other import changes. `web/src/agent-tabs/command-input/CommandInput.test.tsx` stubs `complete` directly and needs no edit. Resolve by running the `ai/tasks/hygiene/improve-modularity.md` task against `web/src/agent-tabs/AgentTabBody.tsx`.


## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
