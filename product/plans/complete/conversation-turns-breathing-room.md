# Fix: separate the conversation body from the rest of the tab

**Complexity: 1/10** — one padding value in the conversations stylesheet, the style test that pins it, and the conversations spec. No component, server, protocol, or plugin-contract work.

## Goal

Give the conversation tab's turn list enough room above and below that the conversation reads as its own region instead of running straight into the metadata row above it and the message input below it.

## Problem

The conversation tab drops the padded plugin frame so its command bar can span the full width, and the regions above the bar take that padding back. The turn list took back only `8px` vertically, which is the same value the metadata row and the command bar each use for their own padding. The result is that the newest turn sits `8px` from the rule above the input and the oldest visible turn sits `8px` below the title row, so the conversation crowds both.

## Approach

Double the turn list's vertical padding to `16px` and leave its horizontal padding at `12px`, so the conversation stays left-aligned with the title above it and the command line below it while gaining clear separation from both. Give the deleted notice the same `16px` below it, since it takes the turn list's place as the last thing above the command bar when a conversation is deleted.

Rejected: increasing the horizontal padding as well. That would indent the conversation text away from the title and the command line it currently aligns with, which trades one misalignment for another.

Rejected: adding a rule beneath the metadata row the way the conversation list has one. The list needs it because its rows start immediately below; the tab's separation problem is spacing, and a second rule in the tab would compete with the command bar's.

## Implementation steps

1. **`web/src/plugins/conversations/conversations.css`** — change `.conversation-turns` padding from `8px 12px` to `16px 12px` and `.conversation-deleted` padding from `0 12px 8px` to `0 12px 16px`, and note in the surrounding comment why the turn list takes back more than the rows around it.
2. Run `./scripts/run.mjs check-diff` and resolve any failures.
3. **`web/src/plugins/conversations/conversations-style.test.ts`** — update the padding expectations for the turn list and the deleted notice, and say in the test name that the turn list is inset further than the rows around it.
4. Run `./scripts/run.mjs check-diff` and resolve any failures.
5. **`product/specs/conversations.md`** — state that the turn list is inset from the metadata row and the message input.
6. Check `help.md` and `documentation/user-documentation/` for existing conversation-tab layout guidance and update it only if it already describes this spacing.

## Tests

- The turn list carries `16px 12px` padding, keeping its horizontal alignment with the rows around it while sitting further from them vertically.
- The deleted notice keeps that same clearance above the command bar.
- The metadata row's own padding is unchanged.

## Out of scope

- The conversation list tab, whose rows have their own spacing.
- The gap between turns, the query bubble's own padding, and the command bar, all of which are already spaced deliberately.
- The metadata row's contents and alignment.
- Padding in any other plugin tab.
