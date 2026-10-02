<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Guarantee each member gets its own clone directory when two model names fold to the same workspace name.

Existing Issue: `memberWorkspaceName` in `src/multiagent/workspaces.ts` derives a member's workspace name by replacing every `/` in the model with `-`, and that folding is not injective — a project overriding `.janissary/harness-models.json` can carry both `a/b` and `a-b`, which derive the same name, so `WorkspaceManager.create` is called twice for one name and the second call overwrites the first's `refs` and `pending` entries. Severity: 5/10

Existing Risk: 6/10 - Two members then share one clone directory and are each sandboxed to it, so two agents write into the same working tree concurrently and neither answer describes a workspace of its own; cancelling one clone cancels the other's, and the first clone to settle deletes the pending entry belonging to the second.

Proposal Risk: 2/10 - Names become provably distinct, which removes the collision rather than narrowing it; what remains is the existing readability of a name derived from the model.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1513: keep each member's workspace name distinct when two models fold to the same name". In `memberWorkspaceName` in `src/multiagent/workspaces.ts`, make the derivation injective by appending the member's index — `<label>-<model with / replaced by ->-<index>` — which keeps the folder readable while guaranteeing distinctness for any model list, and is the reason the plan required distinct names in the first place since `WorkspaceManager`'s `pending` and `cancel` are both keyed by name. Both `provisionMembers` and `releaseMembers` call this helper, so the cancel a close issues stays paired with the create that started it; pass the index through at both call sites. Add cases in `src/multiagent/workspaces.test.ts` asserting that two models differing only in a `/` versus a `-` derive different names, and keep the existing derivation cases for a slashed model, an unslashed one, and two labels, updating their expectations to include the index.

* Describe the multi-agent tab and the `fanout` member completion in the user documentation.

Existing Issue: The user documentation's Tab Types section in `documentation/.vitepress/config.mts` lists a page for every other view tab kind — editor, file navigator, notifications, conversations, sessions, the SQL browser — and the new multi-agent tab has none, while the completion-context table in `documentation/user-documentation/command-bar/tab-completion.md` enumerates every position that completes and omits the `fanout opencode:` member position this pull request adds. Severity: 4/10

Existing Risk: 4/10 - A user reading the shipped documentation finds no mention of a tab the application now opens and no mention of the completion that makes the command usable, so the feature is discoverable only by reading `help` or the source.

Proposal Risk: 2/10 - Documentation only; the risk that remains is prose drifting from behavior later, which the existing doc review already covers.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1513: document the multi-agent tab and the fanout member completion for users". Add a page under `documentation/user-documentation/tab-types/` describing what the tab shows and how to start a run, following the goal-first structure in `ai/guidelines/user-documentation.md` — lead with `fanout opencode:<model>... <prompt>` as the thing a reader can now do, keep it to the task rather than the architecture, and link it from the Tab Types list in `documentation/.vitepress/config.mts` beside the other view tabs. Add one row to the context table in `documentation/user-documentation/command-bar/tab-completion.md` for a `fanout` member token that already names its harness, next to the existing `harness --model` row, stating that the candidates are that harness's known models offered as `opencode:<model>` and that a bare `fanout` still completes filesystem paths. `product/specs/multi-agent-tab.md` and the new rule in `product/specs/tab-completion.md` are the source material; the spec's "What it does not do" section is the right thing to summarise briefly, since a reader's first question about a comparison tool is what it will do with the winner.
