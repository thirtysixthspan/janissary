# Integrate Font Awesome icons

**Complexity: 4/10** — web-only with no protocol, persistence, or new interaction logic, but correctness hinges on catching every one of ~20 glyph call sites across ~15 components (four separate agent-dot sites, four disclosure-chevron sites, plus emoji), preserving the inline `dotColor`/`busy` styling on each dot, and updating the existing tests that assert on literal glyphs.

Replace the ad-hoc emoji and Unicode-symbol glyphs used throughout the web UI's own chrome (tabs, buttons, badges, prompts, flags, status dots, disclosure chevrons) with Font Awesome icons, integrated via the official SVG-in-React packages. Today these glyphs are inline text characters scattered across components — 📁 ➕ ✨ ⇄ 📦 ⚡ 📷 👍 👎 ☰ ↺ ✓ ❯ ● ▸ ▾ — which render inconsistently across platforms and fonts. This feature adds Font Awesome (free tier) to the Vite/React app, routes every replaced glyph through a single central icon-registry module, and swaps each call site to render a `FontAwesomeIcon`. Purely typographic punctuation (em-dashes, and the ← → ↔ arrows that appear in help/legend text and comments) is left as plain text, and emoji inside agent transcript or harness terminal content stays untouched.

## Design decisions

- **Scope: chrome icons only, but *every* chrome glyph.** Replace the pictographic emoji (📁 ➕ ✨ 📦 ⚡ 📷 👍 👎) and *all* functional symbol-icons (☰ ↺ ⇄ ✓ ❯ ●-status-dot ●-dirty-marker ▸/▾-disclosure). Do not touch typographic punctuation (em-dashes; ← → arrows in help/legend strings; the ↔ in the dock-cycle source comment). Emoji that appear inside rendered agent/harness/shell content are user/agent output, not app chrome, and are explicitly out of scope. The full enumerated call-site list is in the reuse table below — the implementer must hit all of them, not a representative subset.
- **Integration pathway: SVG + React component (free tier).** Add `@fortawesome/react-fontawesome`, `@fortawesome/fontawesome-svg-core`, and `@fortawesome/free-solid-svg-icons`. Icons are imported individually so only the used icons are bundled; no webfont, no self-hosted font assets, no CDN. This matches the codebase's typed-component style and keeps the bundle minimal. All icons in the mapping below exist in the free-solid package; no free-regular/brands package is needed.
- **Central icon registry.** Introduce one module `web/src/icons.ts` that imports each needed Font Awesome icon and re-exports them under semantic names keyed to their use. Components import from this registry rather than importing `@fortawesome/*` icon packages directly, so the mapping lives in one place and swapping an icon touches one line. The module is a flat set of imports/re-exports with no logic, well under the 200-line limit.
- **Full icon mapping** (all free-solid; the geometric-triangle disclosures use *caret* icons because `faCaret*` are filled triangles matching ▸/▾, while the `❯` prompt is a chevron):
  - 📁 folder (`AgentTabMeta.tsx:38`) → `faFolder`
  - ➕ add tab (`AgentTabMeta.tsx:48`) → `faPlus`
  - ✨ unread badge (`TabItem.tsx:70`) → `faStar` (free; sparkles is Pro-only)
  - 📦 workspaced flag (`tab-flag-display.ts:2`) → `faBox`
  - ⚡ auto-permit flag (`tab-flag-display.ts:3`) → `faBolt`
  - 📷 screenshot (`transcript-line.tsx:101`) → `faCamera`
  - 👍 approve (`MonitorTab.tsx:17`,`:65`) → `faThumbsUp`
  - 👎 reject (`MonitorTab.tsx:17`,`:66`) → `faThumbsDown`
  - ☰ context snapshot (`MonitorTab.tsx:37`) → `faBars`
  - ↺ reset context (`MonitorTab.tsx:38`) → `faRotateLeft`
  - ⇄ dock-swap (`FileTreeTab.tsx:146`, `NotificationsTab.tsx:44`, `SchedulesTab.tsx:86`) → `faRightLeft`
  - ✓ selected theme (`ThemeListPicker.tsx:26`) → `faCheck`
  - ❯ prompt chevron (`transcript-line.tsx:147`; `CommandInput.tsx:211`, two occurrences — the `queue ❯` and bare `❯`) → `faChevronRight`
  - ● agent status/activity dot (`CommandInput.tsx:210`, `TabItem.tsx:46`, `ReportingSection.tsx:61`, `TabNavPicker.tsx:69`) → `faCircle`
  - ● dirty/modified marker (`EditorTab.tsx:177`, shown only when `dirty`) → `faCircle`
  - ▸/▾ disclosure chevron (`FileTreeTab.tsx:175` `files-chevron`, `TaskPicker.tsx:35` `picker-chevron`, `transcript-line.tsx:173` collapsed-line marker, `TerminalCard.tsx:34` `▸` program prefix) → `faCaretDown` when expanded, `faCaretRight` when collapsed/static
- **Agent status dot keeps its per-agent color and busy state.** Every `●` status dot today is a `<span className="dot …" style={{ color: … dotColor }}>●</span>` (e.g. `CommandInput.tsx:210` with `busy` modifier, `TabItem.tsx:46` with `tab.busy`, `ReportingSection.tsx:61`, `TabNavPicker.tsx:69`). The replacement keeps each wrapper span, its `dot`/`busy` classes, and the inline `color: dotColor` style, swapping *only* the glyph for `<FontAwesomeIcon icon={faCircle} />` (which inherits `currentColor`, so the inline color still tints it). Do not move the color onto the icon or drop the `busy` class.
- **Dirty marker stays conditional.** `EditorTab.tsx:177` renders `{dirty ? ' ●' : ''}` appended to the editor name; the replacement renders the `faCircle` icon only when `dirty`, preserving that it is absent when the file is clean (the existing `EditorTab.test.tsx` asserts both presence and absence — see Tests).
- **Accessibility: preserve current semantics.** Each replaced icon carries over its existing accessible name — where a glyph today has `role="img"` + `aria-label` (e.g. `TabItem.tsx:70` "unread") or a button `title`/`aria-label` (e.g. `MonitorTab.tsx:37`–`:38` "Open context snapshot"/"Reset context", the flag `label`s in `tab-flag-display.ts`), the Font Awesome icon keeps that name via the component's `title` prop and/or the surrounding element's existing `aria-label`/`title`. Purely decorative icons (the disclosure carets, the `TerminalCard` prefix, the status dots) render `aria-hidden` (the `FontAwesomeIcon` default). No accessible name that exists today is dropped.
- **Styling preserved.** Icons inherit `currentColor` and font-size so existing `theme.css` rules keep working. Where a glyph got implicit sizing/alignment from line-height (the prompt chevron, the `files-chevron`/`picker-chevron` spans, the flag icons), add minimal `theme.css` rules only as needed for vertical alignment; do not introduce Font Awesome's own CSS.

## What already exists (reuse, don't rebuild)

| Existing glyph / mechanism | Where | Reuse |
| --- | --- | --- |
| Flag emoji lookup table | `web/src/tab-flag-display.ts:1`–`:4` (`{ emoji, label }` for `workspaced`/`autoApprove`) | Repoint at registry icons and update its consumer(s) to render an icon; keep the `label` text as the accessible name |
| Unread badge glyph | `web/src/TabItem.tsx:70` (`role="img"` + `aria-label="unread"`) | Keep the badge span + aria-label; swap ✨ |
| Agent status dot | `web/src/TabItem.tsx:46`, `web/src/CommandInput.tsx:210`, `web/src/ReportingSection.tsx:61`, `web/src/TabNavPicker.tsx:69` (all `<span className="dot …" style={{ color: dotColor }}>●</span>`) | Keep each span/class/inline color; swap only the ● for `faCircle` |
| Dirty/modified marker | `web/src/EditorTab.tsx:177` (`{dirty ? ' ●' : ''}`) | Render `faCircle` only when `dirty` |
| Prompt chevron | `web/src/CommandInput.tsx:211` (`queue ❯`/`❯`), `web/src/transcript-line.tsx:147` | Swap ❯ for `faChevronRight`; keep the `queue ` label |
| Disclosure chevrons | `web/src/FileTreeTab.tsx:175` (`files-chevron`), `web/src/TaskPicker.tsx:35` (`picker-chevron`), `web/src/transcript-line.tsx:173` (collapsed line), `web/src/TerminalCard.tsx:34` (`▸` prefix) | Swap ▸/▾ for `faCaretRight`/`faCaretDown` per expanded state |
| Folder / add-tab glyphs | `web/src/AgentTabMeta.tsx:38`,`:48` | Swap 📁/➕ in place |
| Monitor action buttons | `web/src/MonitorTab.tsx:17`,`:37`–`:38`,`:65`–`:66` (👍/👎, ☰, ↺; buttons already carry `title`s) | Swap glyphs, keep button titles as accessible names |
| Dock-swap buttons | `web/src/FileTreeTab.tsx:146`, `web/src/NotificationsTab.tsx:44`, `web/src/SchedulesTab.tsx:86` | Swap ⇄ for `faRightLeft`; keep button labels |
| Screenshot glyph | `web/src/transcript-line.tsx:101` | Swap 📷 for `faCamera` |
| Theme selected-check | `web/src/ThemeListPicker.tsx:26` | Swap ✓ for `faCheck` |
| Vite build + global stylesheet | `web/vite.config.ts`, `web/src/theme.css`, `web/index.html` | No CSS/font wiring needed (SVG-in-JS); icons inherit `currentColor` from existing theme rules |

## Proposed changes

**Dependencies (`package.json`).** Add `@fortawesome/fontawesome-svg-core`, `@fortawesome/react-fontawesome`, and `@fortawesome/free-solid-svg-icons` as web dependencies. No build-config change is required — Vite bundles the imported SVGs directly.

**Icon registry (`web/src/icons.ts`, new module).** A single module importing each Font Awesome icon used and re-exporting them under semantic names (per the mapping above). No component imports a `@fortawesome/*` icon package directly.

**Component swaps.** In each call site in the reuse table, replace the inline text glyph with a `FontAwesomeIcon` referencing the registry export, preserving the surrounding element, its classes, its inline styles, and its existing accessible name (`aria-label`/`title`). Specific care points: `tab-flag-display.ts` stores an `emoji` string consumed elsewhere — change the table and its consumer so the flag renders an icon while keeping the `label` for the accessible name; the four status-dot sites and the `EditorTab` dirty marker keep their wrappers/classes/inline color and conditional rendering exactly (only the glyph changes); the disclosure sites choose `faCaretDown`/`faCaretRight` from the existing `expanded` boolean. Where a glyph today is decorative it renders `aria-hidden`.

**Styling (`web/src/theme.css`).** Add small alignment/size rules only where a swapped icon needs them (prompt chevron, `files-chevron`/`picker-chevron`, flag icons). Do not import Font Awesome's own CSS.

**Spec updates.** If any spec under `product/specs/` documents a specific emoji/symbol as a user-visible indicator (e.g. the tab flags in `tabs.md`/`monitoring.md`/`notifications.md`, the unread/workspaced/auto-permit indicators, the file-tree chevrons in `file-tree-tab.md`), update the prose to describe the indicator as a Font Awesome icon rather than the specific character. Grep the specs for the affected glyphs and update every match; do not invent new spec sections.

## Tests

The following existing tests assert on literal glyphs and **will fail** after the swap — update each to assert on the rendered icon instead (e.g. the icon's accessible name/title, or the `data-icon` attribute `FontAwesomeIcon` emits, or the presence/absence of the icon element), following whatever query style the file already uses:

- `web/src/EditorTab.test.tsx` (asserts `'●'` for the dirty marker at `:72`,`:74`,`:76`,`:87`,`:333`,`:348`,`:364`,`:372`, including *absence* when clean) — the highest-impact update; preserve the clean-vs-dirty distinction.
- `web/src/TaskPicker.test.tsx:47`,`:53` (asserts `'▸'`/`'▾'` disclosure state).
- `web/src/CommandInput.test.tsx:115` and `web/src/App.test.tsx:413` (assert `'❯'` prompt).
- `web/src/ThemePicker.test.tsx:9` and `web/src/AppThemePicker.test.tsx:10` (assert `'✓'` selected marker).

Grep the web test suite for each replaced glyph character before finishing and update any remaining assertion. Additionally:

- Add/extend a test for `tab-flag-display` and its consumer verifying the workspaced/auto-permit flags render the mapped icon with the correct accessible label ("Workspaced" / "Auto-permitting").
- Add a focused test that the unread badge (`TabItem`) and the monitor approve/reject/snapshot/reset buttons still expose their existing accessible names after the swap, so accessibility is not regressed.
- No server tests are affected — this is a `web/src/` only change (Vitest `client` project, tests colocated as `web/src/**/*.test.tsx`).

## Out of scope

- Emoji or symbols inside rendered agent transcript content, harness terminal output, or shell output — user/agent content, untouched.
- Typographic punctuation: em-dashes and the ← → ↔ arrows used in help text, legends, and source comments remain plain text.
- Font Awesome Pro icons/styles and any license/auth-token setup — free tier only.
- A theming/skinning system for icons beyond inheriting `currentColor`; no per-theme icon variants.
- Adding new icons for UI that has no icon today — this feature only replaces existing glyphs one-for-one.
- Any server-side change or protocol change; icon selection stays entirely client-side.

## Verification

- Run `./scripts/run.mjs check-diff` and confirm lint, typecheck, and the affected web tests pass.
- Manual check: build and open the web app; confirm every replaced glyph now shows a Font Awesome icon — the tab folder/add controls; the unread badge; the workspaced (box) and auto-permit (bolt) flags; the command prompt chevron and per-agent activity dot (still tinted by agent color and reflecting busy state) in the command bar, tab strip, reporting section, and tab-nav picker; the editor dirty dot (present only when modified); the transcript screenshot icon and collapsed-line caret; the file-tree, task-picker, and terminal-card disclosure carets; the monitor approve/reject/snapshot/reset buttons; the file-tree/notifications/schedules dock-swap buttons; and the theme selected-check. Confirm no icon renders as a blank/tofu box, that help-text arrows and em-dashes are unchanged, and that screen-reader labels ("unread", "Workspaced", "Reset context", etc.) are preserved.
