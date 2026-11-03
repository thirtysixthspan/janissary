# Follow Streamed Connection Activity

**Complexity: 2/10** — the existing content-change key can include the newest activity text, and a focused scroll-hook test can verify the existing follow and restoration behavior.

## Goal

Keep an active connection record history at the bottom while its newest streamed activity entry grows, without pulling a reader back after they scroll away.

## Approach

Include the latest block's last activity text in `ConnectionTab`'s content key. Let the existing scroll hook respond to the changed key, preserving its active-view and near-bottom checks and its older-page restoration precedence.

## Implementation steps

1. Include the latest activity entry's text in the connection history content key.
2. Extend the scroll-hook test harness to model streamed text growth and verify bottom following for near-bottom readers but not readers who scrolled away.
3. Update the connection behavior spec to describe history following during streamed activity.

## Tests

- Growing the last entry's text without changing its kind or the entry count triggers following for an active reader at the bottom.
- Growing the last entry's text does not move a reader who scrolled away.
- Existing inactive-view, older-page deduplication, rejection retry, and scroll-restoration cases continue to pass.

## Out of scope

- Changing the bottom-follow threshold or active-view policy.
- Changing history paging or activity rendering.
- Adding user documentation where no existing page describes connection record history.
