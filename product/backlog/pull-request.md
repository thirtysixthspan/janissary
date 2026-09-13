# pull-request

* Restore the payload type boundary for the newly introduced conversation draft field.

Existing Issue: isConversationsPayload claims to validate ConversationTabPayload without checking draftQuery, so it accepts arrays, objects, numbers, and null where the new composer initializer expects an optional string. Severity: 4/10

Existing Risk: 4/10 - A malformed plugin-produced draft can pass both host and client payload validation and reach text-input code under an incorrect string type, turning a payload error into a rendering or submission failure.

Proposal Risk: 1/10 - Tightening the optional-field guard could reject previously tolerated malformed payloads, which explicit valid and invalid payload fixtures make visible.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1110: validate draftQuery in the conversation payload guard". Extend isConversationsPayload in src/plugins/conversations/shared.ts so a conversation payload permits draftQuery only when absent or a string, preserving empty strings and the existing list-payload branch. Add a colocated src/plugins/conversations/shared.test.ts covering absent, empty, multiline, and malformed draft values alongside otherwise valid conversation payloads. The guard is reused by src/plugins/context.ts through activation.isPayload and by web/src/plugins/conversations/index.tsx through the client registry, so retain that shared validation boundary rather than adding casts or coercion inside ConversationComposer. Verify that the existing plugin activation and composer tests still accept correctly formed drafts and that malformed drafts are rejected before the input mounts.


* Correct the pull request description's macOS terminal-selection gesture.

Existing Issue: The terminal behavior example says Shift-click selects harness output on macOS, contradicting both the description's later Option-click instruction and the configured xterm selection gesture. Severity: 2/10

Existing Risk: 3/10 - A macOS user following the behavior example while a harness has mouse reporting enabled cannot form the promised selection and concludes that Chat about this is unavailable.

Proposal Risk: 1/10 - Platform-specific documentation could drift again if terminal options change, so the existing terminal-key tests and the documented macOS manual check remain the reference.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1110: correct the macOS terminal selection gesture in the PR description". Correct the terminal behavior example in PR 1110's description to use Option-drag or Option-click as appropriate for the selection being demonstrated, matching the macOptionClickForcesSelection option and the platform explanation in web/src/shared/terminal/useXterm.ts; reserve Shift selection for non-macOS platforms. Make the behavior example and How to verify instructions agree, without changing terminal behavior. Cross-check product/plans/complete/harness-terminal-copy-selection.md and the existing terminal-key coverage under web/src/shared/terminal, and manually verify selecting harness output with Option on macOS followed by the Chat about this action when implementing this entry.
