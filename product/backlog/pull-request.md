<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the contradictory remote-launch statement in the remote-server spec.

Existing Issue: The new standalone remote shell section says a shell opens even when its source tab is remote, then immediately says launching from a remote tab is refused; the implementation rejects that nested launch. Severity: 4/10

Existing Risk: 3/10 - Readers of the spec can form incompatible expectations about whether remote-to-remote launches are supported, making later changes and reviews harder to judge.

Proposal Risk: 1/10 - A single unambiguous statement will align the remote-server spec with the command behavior and shell spec.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1579: clarify remote shell behavior from remote tabs". Correct the standalone remote shell paragraph in `product/specs/remote-server.md` so it says that a launch creates its own SSH channel and workspace when issued from a local tab, and that issuing `zsh … on <address>` from a remote tab is refused. Keep the restriction consistent with `product/specs/shell-tab.md` and the nested-launch rejection in `src/plugins/shell/activate.ts`; do not broaden implementation behavior as part of this documentation correction.
