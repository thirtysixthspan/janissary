# Tab metadata row

**Complexity: 3/10** — small, well-scoped feature: one new `Tab`/`TabView` field, one server computation site, and three independent client render sites with a shared display-data lookup; no new protocol round trip or state machine.

Agent tabs, harness tabs, and shell (PTY-takeover) tabs each gain a small metadata row showing the tab's current working directory, followed by a status area that displays an emoji for each of the tab's currently-active flags — today, whether the tab is workspaced (has its own isolated git clone) and whether harness auto-permitting (auto-approving its own permission prompts) is enabled. A flag with no active state simply contributes no emoji; there is no "disabled" indicator. The mechanism is deliberately extensible, since more flags of the same kind are expected later.

## Design decisions

1. **Flags are carried as an extensible list, not individual booleans.** `TabView` gains one new field — a list of active flag identifiers (e.g. `flags: string[]`) — populated server-side. Adding a future flag means appending a new identifier to that list server-side and teaching the client's flag-display lookup about it; it never requires another wire-shape change, matching the feature's own "other features will be flagged there as well in the future."

2. **No shared row component.** `HarnessTab.tsx`, `ShellTab.tsx`, and the normal agent-tab body (in `App.tsx`) each render their own metadata row markup independently, since their surrounding layouts already differ (bare full-tab terminal vs. transcript-and-command-bar). A small shared *display lookup* (mapping a flag identifier to its emoji and tooltip label) is still shared across the three, since that's static data, not a component.

3. **cwd is abbreviated**, using the same `shorten()`/`abbreviatePath()` convention already used for the page-tab and file-tree-tab header rows, rather than the raw absolute path.

4. **Auto-permitting stays a harness-only capability.** This feature only surfaces it, it does not extend it — an agent tab or a shell (PTY-takeover) tab's flag list simply never contains the auto-permit identifier, since that capability doesn't exist for those tab kinds today.

5. **Emoji: 📦 for workspaced, ⚡ for auto-permitting.**

6. **Hovering a flag emoji shows a native tooltip naming it** (e.g. "Workspaced", "Auto-permitting"), via a `title` attribute, in addition to an accessible name for screen readers.

7. **Layout: cwd leads the row, active flag emoji trail it.** The row always renders — showing at least the cwd — even when a tab has zero active flags.

8. **Shared class names, independent markup.** Decision 2 rules out a shared *component*, but the row still uses one consistent set of CSS class names across all three render sites, matching the existing `page-meta`/`files-meta` naming convention: `tab-meta` for the row itself, `tab-cwd` for the abbreviated-cwd text, `tab-flags` for the flag-emoji container, and `tab-flag` for each individual flag emoji span (the element carrying `role="img"`, `aria-label`, and the `title` tooltip — mirroring the unread badge's `role="img"`/`aria-label` pattern at `web/src/TabItem.tsx:70`). All four rules live together in `web/src/theme.css` (the project's one stylesheet — confirmed no other `.css` file exists under `web/src`), added near the existing `.page-meta`/`.files-meta` rules (`web/src/theme.css:183`, `:541`).

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| "Workspaced" state already tracked per tab | `Tab.workspaceDir` (presence = workspaced) | `src/types.ts:188` |
| Direct-assignment pattern for a launch-time harness flag onto the `Tab` model (the pattern to mirror for `autoApprove`) | `tab.offline = offline;` in `spawnTab` | `src/harness/manager.ts:106` |
| Source of the auto-permit value at harness-open time | `autoApprove` parameter threaded through `HarnessManager.open`/`spawnTab`/`autoApproveHandler` | `src/harness/manager.ts:48,68,78,99-119,126-134` |
| Path abbreviation already used for a tab's own header | `shorten()` (wraps `abbreviatePath`) | `src/tab/manager.ts:350-352`; already applied to `files.root` in `buildTabView` at `src/tab/view.ts:47` |
| Existing header-row precedent (metadata line at the top of a tab body) | `page-meta` / `files-meta` | `web/src/PageTab.tsx`, `web/src/FileTreeTab.tsx` |
| Accessible emoji-badge pattern (`role="img"`, `aria-label`) | The unread sparkle badge | `web/src/TabItem.tsx:70` |
| The wire-projection function to extend | `buildTabView` | `src/tab/view.ts` |
| The three render sites needing the new row | Bare, header-less bodies today | `web/src/HarnessTab.tsx`, `web/src/ShellTab.tsx`, `web/src/App.tsx`'s normal agent-tab body block |
| Full `TabView` (including `cwd`) already in scope at both PTY-layer call sites, ready to pass down as new props | The tabs-mapping loops that render `HarnessTab`/`ShellTab` | `web/src/MountedViewLayers.tsx`, `web/src/ShellTabLayer.tsx` |
| Confirms `TabView.cwd` has no other client consumer today, so abbreviating it server-side is safe | (absence of any `current.cwd`/tab-level `cwd` usage anywhere in `web/src` today — the only existing `.cwd` reference is the unrelated per-entry `BufferLine.cwd`, already shortened) | `web/src/transcript-line.tsx:120` |

## Proposed changes

### Server: track auto-permit on the `Tab` model

`Tab` (`src/types.ts`, alongside `offline` at `:191`) gains `autoApprove?: boolean`. `HarnessManager.spawnTab` (`src/harness/manager.ts:106`) sets it right next to the existing `tab.offline = offline;` assignment, from the same `autoApprove` parameter it already receives. Unlike `offline`, don't reuse its "Kept so a relaunch restores it" comment: harness tabs are never persisted to `AgentState` (see `HarnessManager.openFromProfile`'s doc comment, `src/harness/manager.ts:85-86`, "Never persisted — harness tabs have no agent state"), so `autoApprove` has no relaunch-restore role — a plain field comment describing what it tracks is enough.

### Server: abbreviate `cwd` and compute `flags` in `buildTabView`

`src/tab/view.ts`'s `buildTabView`: the `cwd` field, currently assigned the raw value passed in (`:25`), is abbreviated the same way `files.root` already is (`:47`) — via the same `shorten` callback the function already receives. A new `flags` array is computed alongside it: `'workspaced'` is included when `tab.workspaceDir` is set, `'autoApprove'` when `tab.autoApprove` is true; otherwise the array is empty. Both source fields come from the `tab: Tab` parameter `buildTabView` already receives (`src/tab/view.ts:8`) — no new parameter, and no change to the call site at `src/tab/manager.ts:369-378`. `TabView` (`src/protocol.ts`, near `cwd` at `:38`) gains the corresponding `flags: string[]` field.

### Client: a small flag-display lookup

A small new module (or a constant colocated with an existing small shared file) maps each flag identifier to its emoji and tooltip label — `workspaced` → 📦 / "Workspaced", `autoApprove` → ⚡ / "Auto-permitting". This is imported by each of the three render sites below; it is data, not a component, so it doesn't conflict with Decision 2's "no shared row component."

### Client: render the row at each of the three sites

- **`web/src/HarnessTab.tsx`**: gains a metadata row above `.harness-body`, showing the tab's abbreviated cwd and its flag emoji (looked up via the shared display data). Needs `cwd`/`flags` threaded in as new props, since `HarnessTab` currently only receives the nested `harness: HarnessView` payload, not the enclosing `TabView`. The call site (`web/src/MountedViewLayers.tsx`) already has the full `TabView` (`t`) in its mapping loop, so passing `t.cwd`/`t.flags` down is a two-prop addition at that existing call site.
- **`web/src/ShellTab.tsx`**: the same addition, mirroring `HarnessTab`'s row markup (the two components already share near-identical bare structure — both wrap their body in the same `harness-tab`/`harness-body` classes today; the new row is a sibling added above `.harness-body` in both, using the shared `tab-meta` class names from Design decision 8). Needs the same two new props, threaded from `web/src/ShellTabLayer.tsx`'s existing mapping loop, which likewise already has the full `TabView` (`t`) in scope.
- **`web/src/App.tsx`**: the normal agent-tab body block (the `!isViewTab && !current.activePty` branch, `:171`) gains the same row as a new sibling immediately before the `.main` div (`:181`), inside the `.tab-body` wrapper — mirroring how `HarnessTab`'s row sits above `.harness-body` as a sibling, not nested inside it. Sourced directly from `current.cwd`/`current.flags`, both already in scope there. **File-size caution**: `web/src/App.tsx` is already at (or within a line or two of) the 200-line `max-lines` cap counted by `eslint.config.mjs:60` (blank lines and comments excluded) — run `./scripts/run.mjs lint-files web/src/App.tsx` after adding the row. If it trips `max-lines`, extract the new row's JSX into its own small single-purpose component (e.g. `web/src/AgentTabMeta.tsx`) imported by `App.tsx`, per the file-size guidance in `ai/guidelines/code-guidelines.md` (extract a module, never compact code to fit). This extraction is private to this one render site, so it does not reintroduce the shared-component Decision 2 rules out.

### Styling

New CSS rules for `.tab-meta`, `.tab-cwd`, `.tab-flags`, and `.tab-flag` (class names and file location decided in Design decision 8): small text and muted color for the row and cwd text, similar treatment to `.page-meta`/`.files-meta`; small size and default cursor for the flag-emoji spans so the `title` tooltip is discoverable.

## Tests

- **`src/tab/view.test.ts`** — cases, added to the existing `describe('buildTabView', ...)` block (see the `'never includes editorDraft...'` case there for the call-shape to mirror: `buildTabView(tab, false, '/tmp', undefined, [], [], [], (p) => p)`): a tab with `workspaceDir` set produces `flags` containing `'workspaced'`; a tab with `autoApprove: true` produces `flags` containing `'autoApprove'`; a tab with neither produces an empty `flags` array; a tab with both produces both identifiers; `cwd` in the resulting `TabView` is abbreviated (pass a non-identity `shorten` stub and assert its output is used), not raw.
- **`src/harness/manager.test.ts`** — a case confirming `spawnTab` sets `tab.autoApprove` to match the `autoApprove` argument it was opened with, mirroring the existing `'threads a profile entry\'s offline flag onto the tab'` case (`:217`).
- **`web/src/HarnessTab.test.tsx`** — cases: the metadata row shows the given cwd; a `flags` list containing `'workspaced'` renders the 📦 emoji with a "Workspaced" tooltip/accessible name; an empty `flags` list renders the row with no flag emoji at all; both flags present render both.
- **`web/src/ShellTab.test.tsx`** — the same set of cases, mirroring `HarnessTab`'s.
- **`web/src/App.test.tsx`** — a case confirming the normal agent-tab body renders the metadata row using the active tab's `cwd`/`flags`.

## Out of scope

- Any flag beyond `workspaced` and `autoApprove` — the feature text anticipates future flags but this plan ships only these two identifiers.
- Extending auto-permitting to agent tabs or shell (PTY-takeover) tabs — it remains a harness-only capability; this feature only surfaces its existing state.
- Any way to toggle a flag from the metadata row itself (e.g. clicking the emoji to enable/disable) — the row is read-only display, matching how these flags are currently only set at tab-creation time via CLI flags.
- View tabs (image, page, markdown, editor, files, notifications, monitor) — this feature is scoped to agent, harness, and shell tabs only, per the feature text.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff`
- Manual: open a plain `agent` tab and confirm its metadata row shows the abbreviated cwd with no flag emoji. Open `agent --workspace` and confirm the 📦 emoji appears with a "Workspaced" tooltip. Open a harness tab with auto-permit enabled (`harness claude -y --workspace`, per the existing "auto-approve requires workspace" invariant) and confirm both 📦 and ⚡ appear. Run an interactive shell command (e.g. `shell vim`) to enter PTY-takeover mode and confirm the shell tab's row matches its underlying agent tab's cwd/flags.
