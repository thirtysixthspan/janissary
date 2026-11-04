<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Plan fidelity: correct the connections-tab documentation's blanket claim that every ACP session remains listed after it closes.

Existing Issue: `product/specs/connections-tab.md` says ACP sessions stay listed after they close and that an ACP session reads Running, Idle, or Closed, and `documentation/user-documentation/command-bar/connections.md` repeats the blanket retention claim, while `src/plugins/connections-topic-rows.ts` emits monitor and editor-persona ACP rows as live-only rows with status `Open` that disappear with their connection and keep no durable record. Severity: 3/10

Existing Risk: 3/10 - A user or implementer reading the authoritative spec expects monitor and persona rows to behave like tracked records, and can mistake the correct live-only behavior for missing history or a broken status.

Proposal Risk: 1/10 - The wording becomes precise with no behavior change; the live-only rows still look different from retained records, as intended.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "distinguish live-only monitor and persona rows from retained ACP records in the connections documentation". In `product/specs/connections-tab.md` under "The connections tab", qualify the retention sentence to tracked core ACP and agent sessions, state that monitor and editor-persona ACP rows are live-only and leave the list when their connection closes, and state that such a live-only row reads `Open` while a tracked core ACP record reads `Running`, `Idle`, or `Closed`. Make the same distinction in `documentation/user-documentation/command-bar/connections.md`'s introduction to live versus retained rows. Verify against `src/plugins/connections-topic-rows.ts` and the monitor and persona fixtures in `src/plugins/connections-topic-rows.test.ts`; no behavior or test change is required.


* Technical debt: keep loaded prompt windows out of the connections-list payload.

Existing Issue: `src/plugins/connections/tabs.ts` builds both the initial and updated list payload from the connections topic's rows unchanged, so whenever a record tab has loaded a window the singleton list tab receives that full prompt history even though `ConnectionList` renders only title, kind, owner, and status; every coalesced delivery duplicates the record history to the list. Severity: 4/10

Existing Risk: 4/10 - The list payload grows with every loaded record window and is validated and retained by the client without being rendered, so large records make ordinary connections updates heavier and can degrade responsiveness.

Proposal Risk: 2/10 - The list keeps only the summary projection; any future list preview must request the record explicitly rather than relying on the window already being present.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "keep loaded prompt windows out of the connections-list payload". In `src/plugins/connections/tabs.ts`, build a summary copy of each row for the list payload in both `openList` and `update` with the `window` key omitted, rather than setting it to `undefined`, because the payload guards treat an own `window` key as present; leave `src/plugins/connections/record-tabs.ts` and the record payload unchanged, and keep `ConnectionList`'s rendering and intents untouched. Add or extend a focused plugin test in `src/plugins/connections/activate.test.ts` or `command.test.ts` asserting that a list payload never carries a record window while an open record tab's payload still does; keep the paging assertions in `src/plugins/connections-topic.test.ts` green.
