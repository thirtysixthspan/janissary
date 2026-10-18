<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Guard, with a test, the hand-kept notification topic count that this change writes into the developer doc, the tab-plugin spec, and the plugin guideline, as the capability count already is.

Existing Issue: The commit writes the topic count as prose ("v2 defines six topics") in the developer doc and repeats it in the tab-plugin spec and the plugin guideline, while the developer doc test pins only the capability count, so no check fails when a topic is added and the prose is left behind, which is how the guideline's count already read four against the five the code defined before this change. Severity: 3/10

Existing Risk: 3/10 - The next topic added to the notification list leaves at least one of these counts wrong with no failing check, and a plugin author copying the developer doc takes the stale count as the contract.

Proposal Risk: 1/10 - A pinned count fails loudly when a topic is added without its prose, and what stays unguarded is only the wording of a sentence that no test reads.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "pin the notification topic count and order in the developer documentation test". In src/plugins/documentation.test.ts, add an assertion beside the capability-count assertion that documentation/developer-documentation/tab-plugins.md contains `v2 defines <count word> topics`, with the count word taken from the length of TAB_PLUGIN_NOTIFICATION_TOPICS through the existing COUNT_WORDS table, and that the topic names appear in the order the list declares them. Import the list from src/plugins/api-topics.ts, where it is exported, the way the test already imports the capability list from ./api.js. Keep every existing assertion unchanged, and say in the new assertion's comment that product/specs/tab-plugins.md and ai/guidelines/plugins-tabs.md carry the same count and no test reads them, so they must be edited with the developer doc. Verify by running the diff-scoped server tests for src/plugins/documentation.test.ts, and by confirming from the assertion's construction that it would fail if the developer doc named only five topics.
