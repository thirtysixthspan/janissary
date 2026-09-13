# pull-request

* Omit the default-menu contribution after its plugin has been disabled.

Existing Issue: Default-menu resolution reads all host declarations without checking plugin status, so it keeps offering Chat about this after the conversations plugin is disabled even though the host refuses to activate it again. Severity: 5/10

Existing Risk: 4/10 - Following a plugin failure, every fresh selection menu advertises an action that cannot open a conversation and repeatedly leads the user into the same failure.

Proposal Risk: 1/10 - Filtering disabled plugins could accidentally exclude a merely unactivated plugin, which a declared-state resolution test would expose.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1110: suppress default-menu actions belonging to disabled plugins". In src/controller/plugin-adapter.ts, resolve contributions against eligible host records using src/plugins/host.ts statusFor, excluding disabled records while retaining declared and active records without triggering activation. Apply the same eligibility rule when running an action so a reply offered before a failure cannot dispatch the now-disabled contributor. Keep the existing unknown-label and multiple-contributor refusal rules in src/plugins/default-menu.ts. Add focused adapter coverage for declared, active, and disabled states and for disablement between resolve and run; use src/plugins/default-menu.test.ts for the existing activation and failure fixtures. Verify that a subsequent browser menu receives no Chat entry after disablement, while Copy and Paste continue to work under web/src/context-menu/DefaultContextMenu.test.tsx.


* Deliver the plan's deferred-response regression tests for the default menu.

Existing Issue: The new next-menu test waits for the first contribution before closing and uses immediately resolved promises, leaving the plan's close-before-reply and out-of-order-reply cases untested. Severity: 4/10

Existing Risk: 4/10 - A future change can remove or misplace the generation guard and install stale menu contributions without failing the new tests.

Proposal Risk: 1/10 - An asynchronous test that does not await all controlled resolutions can pass prematurely, so each reply and resulting menu state must be settled explicitly.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1110: add the planned default-menu stale-response regression tests". Extend web/src/context-menu/DefaultContextMenu.test.tsx with manually controlled promises modeled on web/src/file-navigator/useSelectionAction.test.ts. Cover opening and dismissing a menu before its request resolves, and opening two menus whose requests resolve in reverse order with distinguishable results and selection text. Assert that a dismissed menu stays closed, the newest result remains installed, and activation sends only the newest selection. Include a claimed surface with a client mock and verify it causes no contribution request. Retain the existing ordinary resolve/run and clear-between-menus tests; these additions fulfill the specific stale-reply cases named in product/plans/complete/chat-about-this.md rather than assuming an immediate Promise.resolve exercises them.


* Deliver a remembered-model test that distinguishes restoration from the default model fallback.

Existing Issue: The new creation test remembers the same pair that creation already defaults to, while the restart test reads only the store and never creates a conversation with its nondefault remembered pair. Severity: 4/10

Existing Risk: 4/10 - Removing the remembered-pair branch from conversation creation would still satisfy both new tests, allowing the feature's model-selection promise to regress unnoticed.

Proposal Risk: 1/10 - Tests tied to an incidental catalog ordering can fail after a catalog update, so choose distinct available pairs explicitly and assert the fixture's distinction.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1110: prove new conversations restore a nondefault remembered model". In src/conversations/manager.test.ts, choose a catalogued pair different from the first available model, select it successfully, then create another conversation in the same manager and assert that pair is used. Dispose the manager, construct a fresh fixture using the same storage root, create a new conversation, and assert the same nondefault pair again. Preserve the retired-model fallback case and assert that unsuccessful selectModel calls do not rewrite the remembered pair. Observe the persistence write after each successful selection rather than only the final stored value, and dispose every new manager fixture to release its bus subscription. The existing session-switch and persistence tests must retain their behavior; no model-selection implementation change is needed to make the intended assertions meaningful.


* Reconcile the plan's draft-carrying create contract with the implementation's payload-only draft transport.

Existing Issue: The plugin API adds query to the conversations create action as planned, but the contributor never supplies it, the topic dispatcher ignores it, and ConversationsManager.create still accepts only an id. Severity: 4/10

Existing Risk: 4/10 - A caller following the newly declared create contract can supply a draft that is silently discarded, while the completed plan incorrectly describes a transport that does not exist.

Proposal Risk: 1/10 - Removing the unused optional field could reveal another caller relying on it, which a repository-wide call-site review and type checking would expose.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1110: align the create action contract with payload-only conversation drafts". Preserve the payload-only design explicitly documented in the PR body: remove the unused query property from the conversations create variant in src/plugins/api.ts and revise product/plans/complete/chat-about-this.md wherever it promises query transport through the topic action or ConversationsManager.create. Describe the actual transient draft transport and its notification lifetime, keeping the no-persistence requirement intact. Update the corresponding planned activation-test assertion to verify draftQuery on the opened tab payload rather than on the create action. Review every conversations create call in src/plugins/conversations/activate.ts and src/plugins/topics.ts, and extend src/plugins/conversations/activate.test.ts to assert the id-only create action, the draft-bearing opened payload, and the ordinary list-create path with no draft. Do not leave a public field accepted and silently ignored.


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
