<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Technical debt: keep loaded prompt windows out of the connections-list payload.

Existing Issue: `src/plugins/connections/tabs.ts` builds both the initial and updated list payload from the connections topic's rows unchanged, so whenever a record tab has loaded a window the singleton list tab receives that full prompt history even though `ConnectionList` renders only title, kind, owner, and status; every coalesced delivery duplicates the record history to the list. Severity: 4/10

Existing Risk: 4/10 - The list payload grows with every loaded record window and is validated and retained by the client without being rendered, so large records make ordinary connections updates heavier and can degrade responsiveness.

Proposal Risk: 2/10 - The list keeps only the summary projection; any future list preview must request the record explicitly rather than relying on the window already being present.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "keep loaded prompt windows out of the connections-list payload". In `src/plugins/connections/tabs.ts`, build a summary copy of each row for the list payload in both `openList` and `update` with the `window` key omitted, rather than setting it to `undefined`, because the payload guards treat an own `window` key as present; leave `src/plugins/connections/record-tabs.ts` and the record payload unchanged, and keep `ConnectionList`'s rendering and intents untouched. Add or extend a focused plugin test in `src/plugins/connections/activate.test.ts` or `command.test.ts` asserting that a list payload never carries a record window while an open record tab's payload still does; keep the paging assertions in `src/plugins/connections-topic.test.ts` green.
