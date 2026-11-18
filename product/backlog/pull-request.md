<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Complete the plan's connections-spec requirement by listing subagent titles in the tooltip description.

Existing Issue: The plan requires updating the connections behavior spec, and the list section still enumerates a tracked record's own title as only `ACP: …` or `Agent: …` even though this commit makes a subagent record's title `Subagent: <task filename>` and renders it on that same tooltip line. Severity: 2/10

Existing Risk: 2/10 - A later change sourced from the spec treats those two forms as exhaustive and drops the subagent title from a tooltip or its test, while the code and its subagent fixture already produce the third form.

Proposal Risk: 1/10 - After the enumeration names all three forms the spec agrees with the code and its test, leaving only the ordinary cost of keeping a prose spec current.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2064 "list subagent titles in the connections tooltip spec". In product/specs/connections-tab.md, locate the list-section sentence that reads the row's tooltip as its Name, then a tracked record's own title, then the connection's kind, and extend its parenthetical of tracked-record title forms to include `Subagent: <task filename>` alongside the existing `ACP: …` and `Agent: …` forms. Leave the connection-tab section, which already names the subagent title, unchanged. Verify against the tooltip built in web/src/plugins/connections/ConnectionList.tsx and the subagent fixture in web/src/plugins/connections/ConnectionList.test.tsx, which already asserts the `Subagent: research-task.md` title line; no production-code change is needed.
