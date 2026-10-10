<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Restrict the `on <tab name>` clause to shell and harness tabs, as its usage line, its refusal, and the spec all promise.

Existing Issue: The clause's wording in `product/specs/diff-tab.md`, the usage line, and the no-workspace refusal all name "an open shell or harness tab", but `resolveWorkspace` in `src/plugins/diff/activate.ts` accepts any open tab whose record carries a workspace, and a file navigator rooted at a workspace clone inherits its `workspaceDir` — so `diff on <a navigator's label>` opens that clone's diff. Severity: 3/10

Existing Risk: 4/10 - The name a user types opens a tab the wording says it cannot, so the refusal reads as false the first time someone tries a navigator's label, and the set the clause accepts is whatever happens to inherit a workspace directory rather than what the spec says.

Proposal Risk: 2/10 - The clause answers exactly the three outcomes the spec describes, and the navigator case falls into the existing no-workspace refusal.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1629 "restrict the diff on clause to shell and harness tabs". The record `originTab` answers identifies a tab by label, cwd, root, workspace, and remote, so the plugin has no way to tell a shell from a navigator today. Add the tab's view to that record — `view?: 'harness' | 'files' | 'plugin' | 'editor' | 'monitor' | 'notifications'`, read from `tab.view` in `src/plugins/line-capabilities.ts` and documented in `src/plugins/api.ts` — then have `resolveWorkspace` in `src/plugins/diff/activate.ts` answer the no-workspace refusal for a record whose view is neither a harness tab nor one of this plugin's own shell tabs, which is the pair the clause is for. Keep the diff of a workspace a navigator is rooted at reachable the way it always was: the shell or harness tab that opened it carries the same workspace, so naming that tab still opens the same diff. Cover it in `src/plugins/diff/activate.test.ts` with fake records for a files tab and an editor tab, each carrying a workspace, asserting the refusal and that no tab opens, and in the `originTab with a label` block of `src/plugins/context.test.ts` asserting the record names the view. `product/specs/diff-tab.md` needs no edit — the wording it already carries is what the code will then do.


* Draw the sessions row's diff button while the workspace is still provisioning, disabled, the way the plan records it.

Existing Issue: The plan's product decision states the sessions row's diff button "is disabled while the channel's workspace is still provisioning", but `liveActions` in `src/sessions/rows.ts` omits the `diff` verb for a channel that has not landed its workspace, so the button is absent for the whole provisioning window rather than present and unpressable, and `product/specs/sessions-tab.md`'s **Diff** paragraph was written to match the absence. Severity: 3/10

Existing Risk: 3/10 - The control appears later than the eye expects it and in a different shape from every other row's, and a reader comparing the spec to the plan has to work out which of the two is the decision.

Proposal Risk: 2/10 - The button sits where a reviewer expects it from the moment the row appears and turns pressable when the workspace lands.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1629 "draw the sessions diff button disabled while the workspace provisions". `liveActions` in `src/sessions/rows.ts` takes `ready` and drops `diff` when it is false; include `diff` for every live channel instead and let the row's state carry the wait, which is what `detach` already does on a provisioning row, and remove the now-unused `channelReady` helper beside it. The disabled treatment lives in `web/src/plugins/sessions/SessionRowActions.tsx`, where the `disabled` expression special-cases `detach` alone — extend it so a `diff` button on a row whose state is `provisioning` is unpressable too, matching how a shell tab's own metadata button stays inert while its clone lands. Update the **Diff** paragraph in `product/specs/sessions-tab.md`, which currently claims the button is absent on a channel still provisioning, and the `offers no diff on a row whose workspace has not landed` case in `src/sessions/rows.test.ts`, which should assert the verb is offered and the row's state is what keeps it unpressable. The `ssh`, detached, and terminated rows stay absent exactly as they are: those are a different thing from a wait, and the client test in `web/src/plugins/sessions/SessionRowActions.tsx`'s spec already pins that a row offers only the verbs it carries.
