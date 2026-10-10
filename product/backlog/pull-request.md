<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request


* Draw the sessions row's diff button while the workspace is still provisioning, disabled, the way the plan records it.

Existing Issue: The plan's product decision states the sessions row's diff button "is disabled while the channel's workspace is still provisioning", but `liveActions` in `src/sessions/rows.ts` omits the `diff` verb for a channel that has not landed its workspace, so the button is absent for the whole provisioning window rather than present and unpressable, and `product/specs/sessions-tab.md`'s **Diff** paragraph was written to match the absence. Severity: 3/10

Existing Risk: 3/10 - The control appears later than the eye expects it and in a different shape from every other row's, and a reader comparing the spec to the plan has to work out which of the two is the decision.

Proposal Risk: 2/10 - The button sits where a reviewer expects it from the moment the row appears and turns pressable when the workspace lands.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1629 "draw the sessions diff button disabled while the workspace provisions". `liveActions` in `src/sessions/rows.ts` takes `ready` and drops `diff` when it is false; include `diff` for every live channel instead and let the row's state carry the wait, which is what `detach` already does on a provisioning row, and remove the now-unused `channelReady` helper beside it. The disabled treatment lives in `web/src/plugins/sessions/SessionRowActions.tsx`, where the `disabled` expression special-cases `detach` alone — extend it so a `diff` button on a row whose state is `provisioning` is unpressable too, matching how a shell tab's own metadata button stays inert while its clone lands. Update the **Diff** paragraph in `product/specs/sessions-tab.md`, which currently claims the button is absent on a channel still provisioning, and the `offers no diff on a row whose workspace has not landed` case in `src/sessions/rows.test.ts`, which should assert the verb is offered and the row's state is what keeps it unpressable. The `ssh`, detached, and terminated rows stay absent exactly as they are: those are a different thing from a wait, and the client test in `web/src/plugins/sessions/SessionRowActions.tsx`'s spec already pins that a row offers only the verbs it carries.
