<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Finish the manager deletion's cleanup by removing stale editor ACP fields from the remaining test fixtures

Existing Issue: The commit deletes EditorAcpManager and its Managers field but leaves 13 test fixtures still declaring an editorAcp property, so those mocks advertise a manager that no longer exists. Severity: 2/10

Existing Risk: 2/10 - A reader of those fixtures can infer the manager is still wired in, and any future move to strict typing would surface the stale fields as excess-property errors in otherwise unrelated tests.

Proposal Risk: 1/10 - Deleting the dead fields from cast fixtures changes no behavior and keeps the same mocks, so the residue cannot return.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2185 "remove stale editorAcp fields left in test mocks after the manager deletion". The commit removes the editorAcp field from the Managers registry and deletes src/editor/acp-manager.ts, and it already drops that field from the catalog, close, list, connection-manager, transcript, editor-adapter, tab-cleanup, connections-topic-rows and plugin-shared test fixtures, but 13 other test files still declare it: src/plugins/connections-topic.test.ts, src/plugins/launcher/host-lifecycle.test.ts, src/plugins/snapshot-tab.test.ts, src/plugins/teardown.test.ts, src/plugins/update-tab.test.ts, src/plugins/notifications.test.ts, src/plugins/remote-join-capabilities.test.ts, src/plugins/grouping.test.ts, src/plugins/dock-tab.test.ts, src/plugins/launch-tab.test.ts, src/tab/manager.test.ts, src/tab/opening-state.test.ts and src/acp/record-feed.test.ts. Remove only the editorAcp entries (the connectionsFor, closeTab and noOp stubs) from those fixtures; every one is an `as unknown as Managers` cast or an Object.assign target, so no test behavior or assertion changes. Do not re-add any editor scope to the wire types or reintroduce the manager — those removals are the plan's goal and are correct. The affected tests cover plugin teardown, tab release, remote join and record-feed closing; their existing assertions on the surviving managers must keep passing unchanged.
