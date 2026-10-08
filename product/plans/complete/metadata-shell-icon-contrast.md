# The harness and ssh metadata row's new-shell icon renders dark on light instead of light on dark

**Complexity: 2/10** — one CSS rule block in the host stylesheet, mirroring four rules already beside it, plus a dimmed treatment for the state the button already has.

## Goal

Per the backlog: "the new shell icon in the harness and ssh tabs should be light on dark, like the other icons in the metadata bar." `HarnessTabMeta` renders the ➕ as a `<button className="tab-launch-shell">`, and `web/src/theme.css` has no rule for that class anywhere in the repository, so it keeps the browser's default button chrome — a raised light box with a dark glyph — sitting in a metadata bar whose other icons are flat muted marks on the dark surface.

## Background (verified)

- `web/src/shared/HarnessTabMeta.tsx:89-99` renders the button (`newTabIcon` = `faPlus`, `web/src/icons.ts:5`) with `className="tab-launch-shell"`, plus `title`, `disabled={launchDisabled}`, and `onClick`. Harness and ssh tabs share this component — `ssh` is a harness tab (`HarnessTabLayer.tsx:37` is the only place the name is distinguished), so the one render site covers both tabs named in the issue.
- `git grep tab-launch-shell` finds exactly two hits outside plans: that render site and an assertion on the class name in `web/src/harness/HarnessTab.test.tsx:426`. **No stylesheet anywhere in the repo declares it** — not `web/src/theme.css`, not any plugin stylesheet.
- The app sets no `color-scheme` (only `web/src/plugins/pdf/pdf-text-layer.css:25` mentions it, and forces light for that one layer), so the unstyled `<button>` paints with the UA default `ButtonFace` background and `ButtonText` colour, whatever the active palette. `.tab-meta` sets `color: var(--muted)` (theme.css:242-245), but a `<button>`'s UA `color` wins over inheritance, so nothing in the row reaches it either.
- Every sibling control in the same row declares the same flat chrome: `.tab-open-files` (290-294), `.tab-launch-agent` (295-299), `.tab-open-transcript` (300-304), `.tab-connections`/`.tab-schedule` (305-309), `.tab-remote-session` (320-325). `product/plans/complete/agent-tab-open-transcript.md` and `git-sync-icon-buttonface.md` are the precedents — both fixes were exactly this shape.
- `.tab-launch-agent` is now the **shell plugin's** button alone (`web/src/plugins/shell/ShellTabMeta.tsx:72`); the host uses `.tab-launch-shell`. The host stylesheet carries `.tab-launch-agent` still, but adding a host rule for the host's own class does not drag a plugin selector along, and the plugin-ownership tests in `web/src/theme.test.ts:90-119` do not name either class.
- `launchDisabled` is live for this button: `web/src/harness/HarnessTab.tsx:76` sets it whenever the tab is provisioning. The shell plugin's equivalent dimming lives in `web/src/plugins/shell/shell.css:55` and `.tab-remote-session:disabled` in theme.css:325; the host button has neither. Adding a base `color` makes that worse, not better: today a disabled button is visibly a native button, and once it shares the enabled muted colour a dimmed state would be indistinguishable from a live one.

## Approach

Add a `.tab-launch-shell` rule to `web/src/theme.css` next to `.tab-launch-agent`, copying the row's existing flat-chrome declaration rather than inventing one, plus a `:disabled` dimming copied from `.tab-remote-session:disabled`. No component, protocol, or server change.

## Implementation steps

1. **`web/src/theme.css`** — after the `.tab-launch-agent` block (295-299), add the host's own rule for its own class:
   ```css
   /* The new-shell button on a harness or ssh tab. Its class is the host's own, distinct from the
      shell plugin's `.tab-launch-agent`, and it renders the same ➕ in the same row — so it carries
      the same flat chrome. Without it the button keeps the browser's default chrome: a raised light
      box with a dark glyph, in a row of flat muted marks. Dimmed while the workspace provisions,
      the way `.tab-remote-session` and the shell plugin's own button are. */
   .tab-launch-shell {
     background: transparent; border: none; color: var(--muted); cursor: pointer;
     font-size: 13px; padding: 0 4px; line-height: 1;
   }
   .tab-launch-shell:hover { color: var(--fg); }
   .tab-launch-shell:disabled { color: var(--muted); cursor: default; opacity: 0.45; }
   ```
   The `:disabled` rule restates `color` and not just `opacity` for the same reason `.tab-remote-session:disabled` does (theme.css:325) and `shell.css:55` does: it comes after the hover rule, so it must hold the muted colour itself or the button would brighten on hover while unavailable.

2. Nothing else. `HarnessTabMeta.tsx` already applies the class, the title, and the disabled state; no change to it, to `HarnessTab.tsx`, or to anything under `src/`.

## Tests

**Web** — `web/src/theme.test.ts`, in the existing `metadata theme` describe block, following the suite's own style of matching a rule out of the raw stylesheet and asserting on its declarations:

- `it('draws the new-shell button flat and muted, like the rest of the metadata row')` — `theme.match(/^\.tab-launch-shell \{[^}]+\}/m)` is defined, contains `background: transparent`, `border: none`, `color: var(--muted)`, `cursor: pointer`, and `font-size: 13px`; and the hover rule matches `color: var(--fg)`. Without this test the class could be dropped from the stylesheet, or renamed on the component alone, and no component test would notice: the existing `HarnessTabMeta.test.tsx` launch-button cases assert the tooltip, the click, and the disabled attribute, never the appearance.
- `it('dims the new-shell button while its workspace is provisioning')` — the `:disabled` rule is defined, contains `opacity: 0.45` and `cursor: default`, and appears after the plain rule so the cascade gives the disabled state the last word.

No server tests: no `src/` file changes.

## Spec updates

- `product/specs/tabs.md:193` describes the harness new-shell button's tooltip, its effect, and its disabled-while-provisioning state. Add that the button is drawn like the row's other controls — a flat muted mark on the bar, brightening on hover — and that it is dimmed while disabled. That is user-visible behaviour the spec already covers and this fix corrects.

## Docs

- Checked `help.md` and `documentation/user-documentation/` for any description of the metadata row's button appearance — they document the actions, not their rendering (the shell-tab spec at `product/specs/shell-tab.md:212` already describes the shell plugin's button as "disabled and dimmed", which the host button now matches). Per Step 6, no doc update needed.

## Out of scope

- Consolidating the four identical flat-chrome blocks (`.tab-open-files`, `.tab-launch-agent`, `.tab-open-transcript`, `.tab-launch-shell`) into one grouped selector. They are already duplicated four ways and a fifth makes the case for grouping stronger, not weaker — but grouping rewrites four rules this fix does not need to touch, and `theme.test.ts`'s per-rule matching depends on the current shape.
- Moving `.tab-launch-agent` out of `theme.css` into the shell plugin's `shell.css`, now that the host has its own class and the plugin owns that one outright. Correct, and separate.
- Any change to the button's glyph, tooltip, click behaviour, or provisioning gate.