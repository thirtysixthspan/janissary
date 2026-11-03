<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's active-output follow behavior when a streamed activity entry grows in place.

Existing Issue: The record tab's scroll-content key tracks the latest block's entry count but not the text of its last entry, while streamed message and thought chunks append to an existing entry without changing that count, so the scroll effect does not run for those updates. Severity: 6/10

Existing Risk: 5/10 - A reader who opens a running record near the bottom can be left above its newest streamed output until another block or entry changes the key.

Proposal Risk: 2/10 - Tracking the changing activity text makes the active near-bottom viewport follow streamed chunks while retaining the existing threshold and user-scroll behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "follow streamed activity text in connection record history". In `web/src/plugins/connections/ConnectionTab.tsx`, include a changing representation of the latest block's activity content in `contentKey` so updates to the last message or thought trigger the existing effect in `web/src/plugins/connections/useConnectionHistoryScroll.ts`. Keep bottom-follow gated by `capabilities.active` and `isWithinBottomFollowThreshold`, and preserve the older-page restoration path so prepending blocks still takes precedence. Extend `web/src/plugins/connections/useConnectionHistoryScroll.test.tsx` with a case where the last entry's text grows while its kind and entry count stay constant, asserting that active near-bottom readers follow the growth and readers who scrolled away do not. Retain the existing output-follow, inactive-view, older-page deduplication, rejection retry, and scroll-restoration cases.
