# Style the recording flag's button

**Complexity: 1/10** — one CSS rule beside the rules it belongs with, plus one test case pinning the class name. No component, type, protocol, or spec change.

## Summary

The recording flag is the only control this branch added to a metadata row's flag cluster, and it is the only one in that row that never declared its own button reset. `.tab-flag` sets a font size and `cursor: default` and nothing else, and every other button in the row — `.tab-open-files`, `.tab-launch-agent`, `.tab-open-transcript`, `.tab-connections` — declares the same five properties itself. The recording flag is a `<button>` carrying `tab-flag tab-flag--active tab-recording`, so it inherits only the font size and the non-interactive cursor and renders with the user agent's default chrome: a raised grey background, a border, and default padding, sitting in a row of otherwise flat controls.

## Design decisions

1. **The reset goes in the stylesheet, not in the components.** Both `RecordingFlag` and `ShellRecordingFlag` already apply `tab-recording` to the button, so nothing in TypeScript has to change. The alternative — styling the button inline — would put one control's chrome in a component while every sibling's is in the stylesheet, which is the opposite of the pattern the row already follows.

2. **The rule copies the row's existing declaration rather than inventing one.** `background: transparent; border: none; color: var(--muted); cursor: pointer;` plus `font-size: 13px; padding: 0 4px; line-height: 1;` is verbatim what `.tab-open-files` and `.tab-launch-agent` declare, and a `:hover` rule giving `color: var(--fg)` matches their hover treatment so the flag responds to the pointer the way its neighbours do. The row already looks like one set of controls; the point is that it looks like one set again.

3. **The rule sits beside `.tab-flag`, not beside the other buttons.** It is a flag-cluster control drawn as a flag — `font-size` and `color` come from `.tab-flag` and `.tab-flag--active`, which the class list already carries. The other row buttons live further down with the action-group rules, and putting this one there would hide where it comes from.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| The reset declaration to copy, verbatim | `web/src/theme.css` — `.tab-open-files`, `.tab-launch-agent` |
| The hover treatment to match | `web/src/theme.css` — `.tab-open-files:hover`, `.tab-launch-agent:hover` |
| The `.tab-flag` rules this sits beside | `web/src/theme.css` — `.tab-flag`, `.tab-flag--active` |
| The class name, already applied by both renderers | `web/src/shared/RecordingFlag.tsx`, `web/src/plugins/shell/ShellRecordingFlag.tsx` |

## Proposed changes

One rule added to `web/src/theme.css`, immediately after the `.tab-flag--provisioning` animation rule that closes the flag cluster:

- `.tab-recording` — the button reset and pointer cursor described above.
- `.tab-recording:hover` — the `color: var(--fg)` hover the row's other buttons carry.

No TypeScript changes. `stylelint` runs over `web/src/**/*.css`, so any color literal in the new rule stays in the short form the file already uses (`var(--muted)` and `var(--fg)` are used as-is, so no literal is introduced).

## Tests

One case added to `web/src/shared/AgentTabMeta.test.tsx`, in the group of recording-flag cases already there:

- The pressable flag carries the `tab-recording` class.

No case pins that class today, so a rename of it would silently drop the styling this fix adds — which is exactly the failure this fix exists to prevent, so the assertion is the point rather than the coverage. Stylelint and the browser are the instruments for the rule itself; no test reads stylesheet rules, and none should.

## Out of scope

- Changing any flag's colors, icon, order, or label. The rule resets the button's default chrome and nothing else; `.tab-flag--active`'s green still governs the lit state.
- The inert `<span>` rendering. It takes `tab-flag tab-recording` too, and `.tab-flag` already styles it correctly as a span; the reset matters only on the button, so one rule covers both without a second.
- Any spec or documentation change. The specs describe what the recording flag is and when it is pressable, both of which are unchanged; only its chrome is corrected, and no spec described the chrome in the first place.

## Verification

- `./scripts/run.mjs check-diff` after the change, plus `npm run lint:css` for the stylesheet itself.
- Manual: open a harness tab and a shell tab and look at the metadata row. The film flag should sit flat beside **open file navigator** and **new agent** — no raised background, no border — light green when a recording exists, and its pointer should be a hand with the glyph brightening on hover.