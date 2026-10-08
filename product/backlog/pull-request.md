<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's promised accurate documentation of startup, remote shell restoration, and conversation shell launches.

Existing Issue: Current behavior documentation says no launch opens a shell tab in `product/specs/tabs.md`, says no shell tab is restored in `product/specs/relaunch.md`, describes preserving an agent's persistent shell in `product/specs/remote-server.md`, and says the conversation's new-shell button opens an agent in `documentation/user-documentation/tab-types/conversations.md`. Severity: 5/10

Existing Risk: 5/10 - Readers and future changes can rely on contradictory claims to skip shell restoration, recreate removed agent tabs, or misunderstand what a conversation's shell action opens.

Proposal Risk: 2/10 - Correcting the current-behavior text leaves only the ordinary risk that another documentation reference was missed in this broad removal.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1600: correct current documentation that confuses removed agent tabs with surviving shell tabs". Reconcile the current-behavior sections in `product/specs/tabs.md`, `product/specs/relaunch.md`, and `product/specs/remote-server.md` with the default launch shell and the remote shell/harness restoration path in `src/main.ts`, `src/sessions/attach.ts`, and `src/sessions/restore-tabs.ts`. Update `documentation/user-documentation/tab-types/conversations.md` so its new-shell action is described as opening a shell, and check `documentation/user-documentation/tab-types/file-navigator.md` for its stale claim that a joined agent keeps a remote connection alive. Preserve historical protocol-version explanations where they describe older behavior, and keep references to ACP agents where they remain accurate. The existing session restoration and shell sibling tests in `src/sessions/attach.test.ts`, `src/sessions/manager.test.ts`, and `src/plugins/shell/activate.test.ts` cover the behavior and need no changes for this documentation correction.
