<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Attribute the sessions tab's notification lines to the sessions tab when it is open, as the plan specifies, rather than always to the active tab.

Existing Issue: Plan item 12 states the `remote-session` lines are "attributed to the sessions tab when it is open and to the active tab otherwise", but `report` in `src/sessions/actions.ts` always passes `managers.tab.cur().label` to `notify`, so with the sessions tab open but not focused, a detach raised from a metadata row is attributed to whatever tab the user happens to be reading. Severity: 2/10

Existing Risk: 2/10 - The feed's provenance header names a tab that did not produce the change, so a user scanning the feed later attributes a detach or an end to the wrong surface.

Proposal Risk: 1/10 - The attribution becomes deterministic, but a line about a session will now name the sessions tab even when the action was raised elsewhere, which is the plan's stated intent and is worth one sentence in `product/specs/sessions-tab.md`'s reporting section so the behavior is documented rather than incidental.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1143: session action notifications are attributed to the active tab instead of the sessions tab". In `src/sessions/actions.ts`, resolve the attribution label once per report: the sessions plugin's tab when one is open — its label is what `TabManager.openPluginTab` derives from the manifest's `tabLabelPrefix` (`sessions`, in `src/plugins/sessions/manifest.ts`) and the plugin's fixed `sessions` instance key, resolved the way `NOTIFICATIONS_LABEL` is for the notifications feed in `src/notifications-tab.ts` — falling back to `managers.tab.cur().label` when it is not. Add a case to `src/sessions/manager.test.ts` that a detach with the sessions tab present but another tab active attributes the line to the sessions tab; the provenance formatting pins in `src/notifications.test.ts` must keep passing.
