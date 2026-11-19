# Widen the Hosts row action column so both edit and delete controls are visible

**Complexity: 2/10** — two added production CSS lines in one file, with three requirements (widen the action track, keep the heading on the shared template, stop clipping the actions cell) and four test scenarios (p=3.69).

## Goal

Every Hosts row shows both its edit pencil and delete trash fully, at normal and narrow widths, so the documented row-level delete and its confirmation flow are reachable from the table. The buttons keep their current intents, keyboard activation, and no-selection side effects.

## Approach

`web/src/plugins/hosts/hosts.css` gives `.host-columns, .host-row` one grid whose last track is a fixed `24px`. That slot used to hold the header's empty placeholder `<span />`; the row now puts `HostRowActions` there, a `<span className="host-row-actions">` holding two icon buttons. Each button is about 21px at `font-size: 13px` plus `padding: 0 4px`, and the flex gap is 2px, so the pair needs roughly 44px. The 24px track clips the delete button. On top of that, `.host-row > span { overflow: hidden; text-overflow: ellipsis; }` matches the actions span itself, so even a wider track would still clip at the span boundary. jsdom never lays out CSS, which is why the existing HostList tests find both buttons by accessible name while a real browser hides one.

The change is layout only, in the same feature directory:

1. Widen the last track from `24px` to `4em`. At the grid's `font-size: 12px` that is 48px, enough for both buttons and their gap, with a little slack. The `4em` unit follows the sessions tab, whose own action column uses an `em` track (`web/src/plugins/sessions/sessions.css` ends its six-column template in `6em`). Keeping `.host-columns, .host-row` as one selector means the header's fifth column stays on the exact same template, so its labels cannot drift from the row buttons.
2. Scope the ellipsis rule to the four text cells by class (`.host-row-name`, `.host-row-user`, `.host-row-destination`, `.host-row-path`) instead of `.host-row > span`. That mirrors sessions.css, which applies `overflow: hidden; text-overflow: ellipsis` to named cell classes and never to its actions span. The actions span keeps its `display: flex`, `gap: 2px`, and `flex-shrink: 0`, so it renders both buttons without being squeezed or clipped.

No markup, intent, selection, or protocol behavior changes. Hosts has no separate narrow layout, so the fixed `4em` track and `minmax(0, 1fr)` text cells carry the narrow case: text cells shrink with an ellipsis while the action track and both buttons keep their full width.

## Implementation steps

1. Edit the grid template and the ellipsis selector in `web/src/plugins/hosts/hosts.css`.
2. Run `$janissary/scripts/run.mjs check-diff` and resolve any failures.
3. Add the stylesheet test below, then run `$janissary/scripts/run.mjs check-diff` again.
4. Verify the result by reading the CSS against the sessions.css precedent. Check whether a live scratch-app browser is available; if it is, render the hosts list at normal and narrow widths and confirm both buttons are fully visible, keyboard-activatable, and leave row selection unchanged. If no browser is attached, say so in the report and rely on the stylesheet test and the precedent check.
5. Update `product/specs/hosts-tab.md` as described below.
6. Check `help/hosts.md` and `documentation/user-documentation/`; change them only if they state layout behavior the fix contradicts.

## Tests

Add `web/src/plugins/hosts/hosts-style.test.ts` using the `?raw` stylesheet-import pattern already used by `web/src/plugins/sessions/sessions-style.test.ts` and `web/src/plugins/schedules/schedules-style.test.ts`:

- The shared `.host-columns, .host-row` rule keeps a grid template whose last track is `4em`, wide enough for two icon buttons, and the same rule still carries the `text-align: left` heading alignment.
- The ellipsis rule is scoped to the four text-cell classes and no longer targets `.host-row > span` or `.host-row-actions`, so the actions cell is not clipped.
- `.host-row-actions` keeps `display: flex`, `gap: 2px`, and `flex-shrink: 0`, so both buttons render side by side and never shrink away.

The existing `HostList.test.tsx` cases already cover the two buttons by accessible name, ordinary button-key activation, and leaving the current row selected; they stay unchanged.

## Spec

In `product/specs/hosts-tab.md`, update the Hosts-tab paragraph that describes the trailing column to say it is wide enough to show both the edit pencil and the delete trash in full, and that shortening with an ellipsis applies to the four text cells only, never to the row controls.

## Out of scope

- Changing the edit or delete intents, the confirmation dialog, or row selection behavior.
- Adding a hosts-specific narrow layout; the existing shrinkable text cells already handle narrow widths.
- Changing the sessions or schedules stylesheets, or the shared theme.
- Regenerating screenshots or adding new user documentation.

## Verification

`$janissary/scripts/run.mjs check-diff` passes. Reading the final CSS, the last track fits both buttons, the heading and rows share one template, and no `overflow: hidden` rule matches the actions span. Where an attached browser is available, both controls are fully visible at wide and narrow widths, activate from the keyboard, and leave the selected row alone.
