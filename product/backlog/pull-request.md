<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Document and test the `i` chord, which the pull request description's key list omits.

Existing Issue: The replay tab binds `i` to cycle the idle-time limit, but the pull request description's key table lists only Space or `p`, `.`, `,`, `]` and `[`, and `web/src/plugins/replay/ReplayTab.test.tsx` exercises the idle control by clicking its button rather than by pressing the key. Severity: 3/10

Existing Risk: 3/10 - A chord the application claims and the documentation does not mention is invisible to the person who would rely on it and to the reviewer deciding whether the tab's key handling is reasonable.

Proposal Risk: 1/10 - A documented, tested chord that already works cannot regress by being written down.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1515: document and test the idle-limit chord". Add the `i` row to the key table in the recordings section of `documentation/user-documentation/advanced-agents/harness.md` and to the one in `documentation/user-documentation/tab-types/recording-player.md`, both of which list the same chords, and update the pull request description's key table to match. Add a case to `web/src/plugins/replay/ReplayTab.test.tsx` pressing `i` and asserting the idle control's label advances, alongside the existing case that clicks the same button — the two together pin that the chord and the control are the same action. Leave the chord's placement in the switch in `web/src/plugins/replay/ReplayTab.tsx` as it is, and note in that switch's comment that the idle chord is deliberately unshifted so it cannot collide with the terminal's own keys.