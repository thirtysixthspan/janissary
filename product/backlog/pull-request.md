<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Remove the unused route exports and the unread terminal ref the new modules leave behind.

Existing Issue: `src/plugins/core-route-claims.ts` exports `pluginCoreRoutes` and `coreRouteOwner` that nothing imports — the host resolves its own map from the declarations it was constructed with, which is what makes a fixture catalog authoritative — and `web/src/plugins/replay/useReplayTerminal.ts` keeps a `live` ref it assigns and never reads, left over from when the copy chord read the terminal through it. Severity: 2/10

Existing Risk: 2/10 - Dead exports read as the supported entry point and invite a second call site beside the one the host actually uses; the dead-check tooling in the human's end-of-work gate reports them as unused.

Proposal Risk: 1/10 - Nothing reads either symbol, so removing them cannot change behavior.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1515: remove the unused route exports and the unread terminal ref". Delete `pluginCoreRoutes` and `coreRouteOwner` from `src/plugins/core-route-claims.ts`, leaving `resolveCoreRoutes` as the module's single export, and remove the `live` ref and its assignment from `web/src/plugins/replay/useReplayTerminal.ts`, since the copy chord closes over the terminal and the capability directly. Confirm nothing else imports either symbol first — a grep for `pluginCoreRoutes` and `coreRouteOwner` across `src/` and `web/src/` is the whole check — and leave `resolveCoreRoutes`'s refusal-recording behavior and the copy chord's behavior untouched.

* Document and test the `i` chord, which the pull request description's key list omits.

Existing Issue: The replay tab binds `i` to cycle the idle-time limit, but the pull request description's key table lists only Space or `p`, `.`, `,`, `]` and `[`, and `web/src/plugins/replay/ReplayTab.test.tsx` exercises the idle control by clicking its button rather than by pressing the key. Severity: 3/10

Existing Risk: 3/10 - A chord the application claims and the documentation does not mention is invisible to the person who would rely on it and to the reviewer deciding whether the tab's key handling is reasonable.

Proposal Risk: 1/10 - A documented, tested chord that already works cannot regress by being written down.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1515: document and test the idle-limit chord". Add the `i` row to the key table in the recordings section of `documentation/user-documentation/advanced-agents/harness.md` and to the one in `documentation/user-documentation/tab-types/recording-player.md`, both of which list the same chords, and update the pull request description's key table to match. Add a case to `web/src/plugins/replay/ReplayTab.test.tsx` pressing `i` and asserting the idle control's label advances, alongside the existing case that clicks the same button — the two together pin that the chord and the control are the same action. Leave the chord's placement in the switch in `web/src/plugins/replay/ReplayTab.tsx` as it is, and note in that switch's comment that the idle chord is deliberately unshifted so it cannot collide with the terminal's own keys.