<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that open plugin labels always retain dirty handles.

Existing Issue: The description says the app retains a plugin dirty handle while its label remains open, but the delivered API now removes that registration when the plugin explicitly passes `null`. Severity: 3/10

Existing Risk: 3/10 - Plugin authors and reviewers can misunderstand whether an explicit unregister should clear the marker and save prompt for an open tab.

Proposal Risk: 1/10 - The description will match the explicit-unregister contract, while the API documentation and tests continue to define the behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1957 "clarify explicit dirty-handle unregistering in the PR description". In the current pull request body's implementation paragraph, qualify the sentence that says the app retains plugin dirty handles while their labels remain open: explain that explicit `registerDirtyHandle(null)` removes the registration, while the image editor retains its handle across placement remounts and the host removes it when the tab closes. Keep the rest of the title and body unchanged. Check the wording against `web/src/plugins/api.ts` and `documentation/developer-documentation/tab-plugins.md`; the existing `web/src/App.test.tsx` unregister test and `web/src/plugins/image/ImageEditor.test.tsx` placement-lifecycle test cover the two behaviors and should remain unchanged.
