# Include the subagent title in the connections spec's tooltip description

**Complexity: 1/10** — documentation only; one spec sentence gains a third tracked-record title form, with no production code or new tests.

Issue: Complete the plan's connections-spec requirement by listing subagent titles in the tooltip description.

## Goal

The connections behavior spec's list section describes a tracked record's tooltip as carrying the record's own title, but its parenthetical names only the `ACP: …` and `Agent: …` forms. A subagent record's title is now `Subagent: <task filename>`, and the list already renders that title on the same tooltip line. Make the spec's enumeration complete so it matches the code and its test.

## Approach

The tooltip is built in `web/src/plugins/connections/ConnectionList.tsx`: `rowTooltip` writes a record row as `Name`, then `row.title`, then the connection's kind, with no branching on title form. The subagent fixture in `web/src/plugins/connections/ConnectionList.test.tsx` already asserts `subagent:research\nSubagent: research-task.md\nagent`, so the third form is already covered by code and test. No production or test change is needed. The connection-tab section of the spec names the subagent title already, so it stays as it is. Only the list-section sentence changes.

## Implementation steps

1. In `product/specs/connections-tab.md`, in the connections-tab (list) section, find the sentence "The row's tooltip reads its Name, then a tracked record's own title (`ACP: …` or `Agent: …`), then the connection's kind." Extend its parenthetical to include `Subagent: <task filename>` alongside the existing `ACP: …` and `Agent: …` forms. Leave the connection-tab section's title description, which already names `Subagent: <task filename>`, unchanged.

## Tests

No new tests. The existing subagent fixture in `web/src/plugins/connections/ConnectionList.test.tsx` already asserts the `Subagent: research-task.md` title line in the tooltip; this fix changes only spec prose and needs no new test coverage. The whole suite is still run through `check-diff` to confirm nothing regressed.

## Out of scope

- Production code and existing tests; the tooltip logic and its subagent fixture already produce and assert the third form.
- The connection-tab section of `product/specs/connections-tab.md`, which already names the subagent title.
- Any other backlog entry or spec.

## Specs and docs

- `product/specs/connections-tab.md`: the list section's tooltip sentence lists all three tracked-record title forms — `ACP: …`, `Agent: …`, and `Subagent: <task filename>`.
