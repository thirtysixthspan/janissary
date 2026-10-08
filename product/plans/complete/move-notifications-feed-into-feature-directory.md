# Move the notifications feed into `web/src/notifications/`

## Complexity

3/10 — three file moves, four import-path retargets, no logic changes.

## Goal

`web/src/NotificationsTab.tsx` and `web/src/notifications-handlers.ts` sit in the flat app-shell root while the rest of the capability — `web/src/notifications/native-notifications.ts`, `web/src/notifications/useNativeNotifications.ts`, `web/src/notifications/alert-placement.ts` — lives in `web/src/notifications/`, in violation of §1 of the React organization guidelines (organize by feature, not by file type). Move the feed's component and its keyboard-scroll handler into the directory that names the feature so the capability stops being split across two locations and the next change to it is planned against one directory.

## Approach

`git mv` the feed component and its colocated test into `web/src/notifications/` with content unchanged, and move `web/src/notifications-handlers.ts` to `web/src/notifications/feed-keys.ts` — renamed because `notifications/notifications-handlers.ts` stutters and `feed-keys.ts` matches the convention the feature's neighbours use — keeping `onNotificationsKey` as its only export. The deepest move is one directory down, so the moved component's `./ws` and `./shared/…` specifiers gain one `../`, while its `./notifications-handlers` becomes `./feed-keys` unchanged in relative terms because the two files move together. Retarget both app-shell composition sites that render the feed — `web/src/ViewTabBody.tsx` and `web/src/Sidebar.tsx`, the latter the item's proposal does not name but which imports the component just the same — to `./notifications/NotificationsTab`. No feature imports a feature: both sites are app-shell composition, which §3 allows to import a feature. Neither moved file carries a stylesheet import, so nothing else follows them.

## Implementation

1. `git mv web/src/NotificationsTab.tsx web/src/notifications/NotificationsTab.tsx` and `git mv web/src/NotificationsTab.test.tsx web/src/notifications/NotificationsTab.test.tsx`.
2. `git mv web/src/notifications-handlers.ts web/src/notifications/feed-keys.ts`.
3. In the moved `web/src/notifications/NotificationsTab.tsx`, retarget `./ws` to `../ws`, `./shared/transcript/Transcript` to `../shared/transcript/Transcript`, `./shared/DockCycleHeader` to `../shared/DockCycleHeader`, `./shared/transcript/transcript-intents` to `../shared/transcript/transcript-intents`, `./shared/terminal/pty-actions` to `../shared/terminal/pty-actions`, and `./notifications-handlers` to `./feed-keys`. The `@shared/protocol` alias is depth-independent and stays.
4. In the moved `web/src/notifications/NotificationsTab.test.tsx`, retarget `./ws` to `../ws`; the `./NotificationsTab` specifier stays.
5. Change `./NotificationsTab` to `./notifications/NotificationsTab` in both `web/src/ViewTabBody.tsx` and `web/src/Sidebar.tsx`.
6. Run `./scripts/run.mjs check-diff` after the moves and again after the retargets.

## Tests

No new tests. `web/src/notifications/NotificationsTab.test.tsx` is the suite that pins the feed's rendering — the dock-cycle and header behavior and the transcript contents — and it moves with its source, needing no edit beyond the `./ws` retarget. It must keep passing from its new location.

## Out of scope

- Renaming `onNotificationsKey`, or touching the other modules already in `web/src/notifications/`.
- Any change to the feed's rendering, props, or keyboard behavior.
- Editing the historical references to the old paths in `product/plans/complete/` — plans record where code lived when they were written.
- Any change to `web/src/shared/DockCycleHeader.tsx`'s comment naming `NotificationsTab`; it names the component, not a path.

## Verification

- `./scripts/run.mjs check-diff` passes after each step.
- A repository-wide search finds no remaining import of `./notifications-handlers` or `./NotificationsTab` from the app-shell root.

## Documentation and specification impact

None. This is a behavior-preserving source-layout refactor; nothing a user can observe changes, so no spec, `help.md`, or user documentation update is needed.
