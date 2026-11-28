# Refresh the MCP pull request's evidence references

**Complexity: 1/10** — Five description requirements and no production code or test changes (p=2.84).

## Goal

Point reviewers of PR #2256 to the current implementation and assertions for the behavior described in the pull request. Add references to the manual verification actions that a reviewer needs to trace.

## Requirements

1. “Update the existing code references” that moved during earlier listener, relay, launch, and focus repairs.
2. “Recheck every Behavior examples transcript” against the current branch.
3. Recheck “every How to verify action and expectation” against the current branch.
4. Correct “the wrong test name for the original-ID assertion in step 13”.
5. “Preserve unrelated wording and historical test evidence”.

## Design decisions

- Read the live description after the action corrections publish. Keep references that already land on their claim and preserve the existing wording and layout.
- Resolve source line ranges from the final branch, including the replay repair. Use current named test assertions where they give more direct support than a code range.
- Preserve the Additional test cases section as a historical record.

## Preserved behavior

None found

## Assumptions

1. `src/mcp/listener.ts:9` owns `createMcpServer`, including the route and request guard.
2. `src/remote/serve-detach.ts:181` calls `linkChanged(true)` after attaching a peer, triggering replay handling.
3. `web/src/shared/questions/QuestionPanel.tsx:26` calls `onBeforeRemove` with whether the dialog owned focus.

## Existing functionality

1. `src/remote/serve-mcp.test.ts:524` declares `re-sends an in-flight call once with its original id when the link returns inside the window`, which checks step 13's first expectation.
2. `src/mcp/manager.test.ts:293` declares `serves a tools/list call that returns exactly question`, which checks the discovery transcript.

## Implementation steps

Check every existing source and test anchor against its claim. Use the actual listener, state writer, queue, focus handoff, and remote grace code to repair references moved by earlier fixes. Cite an existing source path or named test for each Do and Expect line in the final verification steps. Keep the surrounding text byte-for-byte. Promote this plan, remove its backlog entry, and run `$janissary/scripts/run.mjs check-diff` before publication.

After the commit is pushed, fetch the live description again and update the references using `gh pr edit --body-file`. Compare the resulting description with the original and confirm that only references changed.

## UI design

The PR description retains its existing structure and now gives the reader current evidence references.

## Tests

This change adds no application code or behavior, so it adds no tests. The revised description points to existing assertions for the affected claims.

## Out of scope

Application behavior, functional specs, PR title, and the historical test record.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Read the updated description on PR #2256. Every Behavior examples transcript and each numbered Do and Expect line has a reference that lands on its implementation or test. In step 13, confirm the cited original-ID test compares the replayed call with the original, and confirm the Additional test cases section matches its prior text.
