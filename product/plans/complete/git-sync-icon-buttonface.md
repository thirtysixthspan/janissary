# Remove buttonface styling on the git sync icon

**Complexity: 1/10** — a pure CSS fix; two selectors added to an existing rule block, no component or behavior change.

## Goal

The GitHub sync status icon (`web/src/editor/EditorSyncIcon.tsx`) renders as a native `<button>` element when it's clickable (`synced`/`error` states with an `onClick` handler), but `.editor-sync-icon` in `web/src/theme.css` never resets the browser's default button chrome (background, border) — the "buttonface" look. Per the backlog: "remove the buttonface styling on the git sync icon, making it just a clickable icon."

## Approach

Every other icon-only button in `theme.css` (`.tab-open-files`, `.tab-launch-agent`, `.tab-open-transcript`, `.page-close`, `.page-back`/`.page-forward`/`.page-reload`) resets `background: transparent; border: none;` alongside its `cursor: pointer`. `.editor-sync-icon` (`web/src/theme.css:237`) is missing that reset — it only sets `font-size`, `padding`, `line-height`, and `cursor: default`. Add the same reset there, and add `cursor: pointer` on the `--clickable` modifier class (already applied by the component when the icon is interactive) so the icon both looks and behaves like the other icon buttons instead of a native button.

## Implementation steps

1. In `web/src/theme.css`, add `background: transparent; border: none;` to the `.editor-sync-icon` rule, and add a new `.editor-sync-icon--clickable { cursor: pointer; }` rule (the base rule's `cursor: default` stays correct for the non-interactive `provisioning`/`syncing` span states).

## Tests

No new test cases — this is a CSS-only appearance fix with no behavior change. `web/src/editor/EditorSyncIcon.test.tsx` already covers which element type (`button` vs `span`) and classes are rendered per state; those assertions are unaffected. Run `./scripts/run.mjs check-diff` to confirm nothing regresses.

## Spec updates

- Checked `product/specs/editor-tab.md` (GitHub syncing section, lines 205-248) — describes sync behavior and click semantics only, never the icon's visual chrome. No spec change needed.

## Docs

- Checked `help.md` — no mention of the sync icon's appearance. No update needed.
- Checked `documentation/user-documentation/` — no page describes the sync icon's button styling. No update needed.

## Out of scope

- The sync icon's click behavior, tooltip text, or which states are clickable — unchanged.
- Any other icon button in the app — only `.editor-sync-icon` is touched.
