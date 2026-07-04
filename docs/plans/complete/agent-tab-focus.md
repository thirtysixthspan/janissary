# Agent tab creation switches focus to the new tab

## Problem
Running `agent` or `agent <name>` creates a new tab in the background — focus stays on the current tab. The user must manually switch to the new tab, which is disruptive.

## Solution
Change `newAgent` in `profile-manager.ts` to set the active tab to the newly created agent tab instead of keeping focus on the creator.

## Changes

### `src/profile-manager.ts`
- `setActiveTab(findIndex(resolved))` instead of `setActiveTab(findIndex(creator.label))`

### `src/controller.test.ts`
- Update "creates a named agent tab without switching focus to it" → "creates a named agent tab and switches focus to it", assert focus is on the new tab.
- Add `setActiveTab(0)` after `agent bob` in tests that need to remain on janus (connection attribution, info message, schedule in, unread badge, transcript cap).
- Cap test: reset to janus between each `agent` command so all output lands on janus.
- Bus-event cap test: same approach, so the 4th dispatch triggers the cap on janus.

### `spec/tabs.md`
- Update "Agent tab creation" and "Named agent tab" sections to reflect focus switching.
