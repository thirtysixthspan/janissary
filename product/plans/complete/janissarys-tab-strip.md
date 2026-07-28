# Janissary's tab strip

**Complexity: 8/10** — This remains a first-of-its-kind synchronized two-pane UI spanning server tab lifecycle, persistent React layers, focus, navigation, and profiles, but it needs only one secondary selection and reuses the existing resize, batching, handle-map, and profile machinery.

**Minimalism review:** Represent the second visible selection with one stable label beside the existing `activeTab`, keep left as the absent pane value, rely on React's native update batching, reuse the existing resize and label-keyed ref patterns, and fold protocol/reorder/button assertions into existing focused suites instead of creating one-file abstractions and redundant tests.

Add a synchronized right-hand split to the upper center tab area so two ordinary tabs can remain visible and interactive side by side. A tab's existing metadata row or header gains a **Split** button that moves that tab between panes without changing the existing sidebar or reporting layouts. Profiles can declare and save each captured tab's pane so a split workspace can be recreated explicitly.

## Design decisions

- **Creating the split:** Clicking **Split** on the focused tab moves it into a new right pane, restores the most recently focused eligible center tab in the left pane, and leaves the moved tab focused. If there is no second center tab to restore, the action is a no-op.
- **Button wording:** The exact tooltip and accessible label are **"Split"**.
- **Eligible headers:** Show the control on central agent, harness, shell, editor, image, Markdown, page, file-navigator, and schedules tabs because those views already have a metadata row or header. Do not show it on a docked view, a central notifications view (which has no central header), or a monitor/reporting tab. Do not add a header solely to host this control.
- **Pane navigation:** Each pane has its own tab strip and selected tab. Clicking a tab or interacting with a body selects that tab and focuses its pane.
- **Moving between panes:** In an existing split, **Split** moves its tab to the opposite pane and selects and focuses it there. Moving the last tab out of either pane collapses the split; all surviving center tabs are normalized to the full-width left pane.
- **Closing and docking:** Closing or docking the last tab in a pane uses the same collapse rule. Undocking a sidebar tab places and selects it in the currently focused center pane.
- **Layout:** The first version supports one right-hand pane with a draggable vertical divider. It does not support bottom panes, nested splits, or more than two panes. The reporting section stays full-width below the split center area.
- **Synchronization:** Pane membership and both visible selections are server-owned session state broadcast to every connected client. The existing global `activeTab` remains the focused selection; one secondary selection identifies the visible tab in the other pane, so neither a focused-pane field nor a two-entry selections object is needed.
- **Persistence:** Split session state is not added to agent relaunch state. Divider position is client-local, resets on reload, is not synchronized, and is not reported to or saved by profiles.
- **New tabs:** A newly opened center tab joins and becomes selected in the focused pane. Reporting tabs remain outside both panes.
- **Reordering:** `Ctrl+←/→` reorders only among same-pane tabs while retaining the existing group boundary. **Split** is the only direct control that moves an existing tab across panes.
- **Keyboard switching:** `Shift+←/→`, `Cmd+Shift+[/]`, the `next` command, tab navigator, and other existing selection paths continue to use global non-docked tab order; selecting a tab also focuses its owning pane.
- **Unread state:** Both pane selections count as visible and read, even though only one is globally focused. Hidden tabs retain the existing unread behavior.
- **Profile syntax:** An agent, harness, or editor entry may set `tab.pane` to `"left"` or `"right"`. A missing value defaults to `"left"`. Multiple right-pane entries share one right pane and its tab strip.
- **Profile launch:** Apply pane placement as one batch after profile tabs are opened and numbered. Select the lowest-numbered launched entry in each populated pane, then apply the existing `tab.focus: true` winner; when multiple entries request focus, the existing lowest-numbered winner remains authoritative. Unrelated open tabs keep their pane placement.
- **Profile save:** Write an explicit `tab.pane: "left"` or `tab.pane: "right"` for every captured agent, harness, and editor. Save placement only, not either pane's selection or the divider position.

## Existing architecture to reuse

| Existing contract | Grounded location | Planned reuse |
| --- | --- | --- |
| A tab's zero-value layout state is in-memory on the tab object | `src/tab/types.ts:165` — `"export type Tab"` and `src/tab/types.ts:228` — `"dock?: 'left' \| 'right'"` | Add a center-pane marker to `Tab`; absent means left, matching the no-migration pattern used by docking |
| Global selection and focus history are centralized in the tab manager | `src/tab/manager.ts:121` — `"activeLabel"`, `src/tab/manager.ts:146` — `"applyOpenResult"`, and `src/tab/manager.ts:152` — `"setActiveTab"` | Keep `activeTab` as the focused command target and add only one stable secondary label for the other pane |
| Selection, global cycling, and reorder coordination already have extracted operations | `src/tab/navigation-commands.ts:11` — `"setActiveTabOp"`, `src/tab/navigation-commands.ts:25` — `"moveTabOp"`, and `src/tab/navigation-commands.ts:35` — `"reorderTabOp"` | Make selection update the owning pane, preserve global cycling, and supply a pane-filtered reorder result |
| Focus history already rejects closed and docked tabs | `src/tab/focus-history.ts:20` — `"popFocusHistory"` | Add a pane/eligibility predicate for first-split and same-pane close fallback rather than creating a second history system |
| The shared wire protocol has no client-side mirror | `src/protocol.ts:58` — `"TabView"`, `src/protocol.ts:113` — `"StateEvent"`, and `src/protocol.ts:153` — `"RpcCall"` | Add the optional right marker, secondary index, and move RPC to the existing shared types |
| State snapshots are assembled in one place | `src/state-event.ts:11` — `"buildStateEvent"` | Emit the secondary index in the same snapshot as `tabs` and `activeTab` |
| The center composition and reporting area are currently siblings | `web/src/App.tsx:180` — `"TabStrip"` and `web/src/App.tsx:222` — `"ReportingSection"` | Extract only the upper action area into a split-aware component; keep reporting below and full-width |
| Existing split-area and sidebar UI establish resize and filtered-index patterns | `web/src/ReportingSection.tsx:19` — `"MIN_PCT"`, `web/src/ReportingSection.tsx:56` — `"ResizeButton"`, `web/src/Sidebar.tsx:62` — `"divider"`, and `web/src/Sidebar.tsx:69` — `"entries"` | Reuse the local percentage, 15–85 clamp, resize affordance, drag handling, and local-to-global tab index mapping |
| Persistent view layers separate visibility from mounting | `web/src/ShellTabLayer.tsx:13` — `"Persistent layer"` and `web/src/MountedViewLayers.tsx:26` — `"Harness, editor, and page tabs stay mounted"` | Make both selected labels visible while only the globally active label receives keyboard focus and active-only overlays |
| Imperative terminal/editor handles are already stable label-keyed maps | `web/src/useTabHandles.ts:9` — `"useTabHandles"` and `web/src/App.tsx:122` — `"editorHandles"` | Extend the same map pattern to agent input/transcript handles instead of introducing pane-specific ref objects |
| React batches state updates issued by one external callback | `web/src/useServerState.ts:40` — `"client.onState"` | Add the secondary index to the existing state callback/setter fan-out; do not build a second snapshot store or transaction layer |
| Action and reporting tabs are already separated | `web/src/useTabEntries.ts:10` — `"useTabEntries"` and `web/src/ReportingSection.tsx:12` — `"isReportingTab"` | Partition only non-docked action entries by pane; never place monitor/reporting tabs in the split |
| Profile presentation already round-trips through one nested object | `src/profile/types.ts:41` — `"ProfileTab"`, `src/profile/agent-opener.ts:48` — `"candidates"`, and `src/profile/save-entries.ts:14` — `"writeAgentEntry"` | Extend the existing `tab` presentation path rather than add a split-specific profile section |

## Implementation plan

### 1. Define the normalized server and wire model

- Add a shared `CenterPane = 'left' | 'right'` type next to `Tab` in `src/tab/types.ts:165` and an optional in-memory `pane: 'right'` marker on `Tab`; absence means left. Keep it out of `buildAgentStateFromTab` so `--relaunch` always starts unsplit.
- Add one pure `src/tab/split.ts` module for the genuinely new transition logic: pane lookup, first split, cross-pane move, secondary-selection repair, and collapse. Keep that state machine out of `src/tab/manager.ts`, which already carries a file-size exemption; use ordinary array searches at the app's tab scale rather than add indexes or a pane collection abstraction.
- Have `TabManager` own only `secondaryTabLabel?: string`. `activeTab` is the focused pane's selection and the secondary label is the other pane's selection. Clicking the other pane swaps which selection is active without needing a focused-pane field or a left/right selection map.
- This representation deliberately stops at two panes. If a later feature adds a third pane, replace the single secondary label with per-pane selections then; do not generalize before that scope exists.
- Extend `src/protocol.ts:60` `"TabView"` with the same optional right-pane marker and `src/protocol.ts:113` `"StateEvent"` with `secondaryTab?: number`, using the full server tab index. Its absence is the unsplit representation.
- Update `src/tab/view.ts:7` `"buildTabView"` to project the optional marker and `src/state-event.ts:11` `"buildStateEvent"` to resolve the secondary label to an index. Test that a present secondary tab always belongs to the pane opposite `activeTab`.

### 2. Implement the move and collapse contract

- Add `moveTabToOtherPane` with `{ index: number }` to `src/protocol.ts:153` `"RpcCall"`. Route it in `src/message-handler.ts:12` `"handle"` directly to the tab manager, following the direct manager access already used by `focusTab` rather than adding another pass-through to the size-constrained `Controller`.
- On the first split, reject unknown, docked, or reporting targets; if fewer than two center action tabs exist, no-op. Move the requested tab right, select it, and restore the most recent still-valid left-pane label from `src/tab/focus-history.ts:20` `"popFocusHistory"`, falling back to the nearest remaining center tab in global order.
- In an existing split, move the target to the other pane and make it globally active. Put the prior active selection into `secondaryTabLabel` when it remains in the opposite pane; otherwise repair the other visible selection from same-pane focus history, then same-pane adjacent global order.
- If the source pane becomes empty, normalize every center tab to left, retain the moved/surviving active tab, clear `secondaryTabLabel`, and emit one dirty-state notification. The transition must never expose an empty right pane or duplicate the active label as secondary.

### 3. Cover every tab lifecycle and activation path

- Make `src/tab/manager.ts:152` `"setActiveTab"` move the old active label into the secondary slot only when the destination is in the opposite pane, then activate the destination and clear unread. This one path covers strip clicks, `focusTab`, tab navigator selection, schedules-owner selection, and other existing callers.
- Make `src/tab/manager.ts:146` `"applyOpenResult"` assign a newly opened or refocused center tab to the currently focused pane before activation. Preserve group insertion and number semantics.
- Replace direct `activeTab` assignments in `src/harness/manager.ts:151` `"spawnTab"` and `src/ssh-manager.ts:24` `"open"` with the pane-aware activation/open-result path. Audit the remaining assignments in `TabManager` close, dock, reorder, and rehydrate flows so every mutation repairs selections.
- Extend `src/tab/close.ts` and `src/tab/dock.ts` so removing a selected pane member uses same-pane history/fallback and collapses when its pane empties. Undocking enters the focused pane and selects the tab.
- Reset all rehydrated tabs to left in `src/tab/manager.ts:280` `"rehydrate"`. Do not serialize the center-pane marker through agent persistence.
- Keep singleton/refocus openers in their existing pane when they focus an already-open center tab; only genuinely new tabs inherit the focused pane. Profile placement is the explicit exception and runs after opening.

### 4. Preserve keyboard, reorder, and unread semantics

- Keep `src/tab/navigation-commands.ts:25` `"moveTabOp"` on global, non-docked action-tab order. Selecting a destination through `setActiveTab` updates the active/secondary pair. Exclude reporting tabs just as the web action strip does.
- Change `src/commands/next.ts:3` `"next"` to delegate to the same global `moveTab(1)` path instead of incrementing `activeTab` directly.
- Preserve all aliases in `web/src/useWindowKeys.ts:115` `"handleTabShortcuts"`: Shift+arrows and Cmd+Shift+brackets cross panes; Ctrl+arrows reorder only in the focused pane.
- Extend `src/tab/reorder.ts:7` `"computeReorder"` to find the nearest same-pane, non-docked neighbor in the requested direction, require the existing matching-group rule, leave opposite-pane tabs in their global slots, renumber, and persist the two swapped agent states as today.
- Change `src/tab/transcript-commands.ts:9` `"markUnreadTab"` to compare against the active and optional secondary labels. Neither visible tab receives a badge; selecting either pane clears a prior badge. No general visibility set is needed for two panes.

### 5. Build a split-aware upper center area

- Extract the strip/body block at `web/src/App.tsx:180` into `web/src/CenterActionArea.tsx` so `App.tsx` shrinks rather than growing past its current 237 lines.
- Update `web/src/useServerState.ts` and `web/src/ws.ts:37` `"onEvent"` to fan out `secondaryTab` beside `tabs` and `activeTab`. Rely on React's automatic batching for setters invoked by the same WebSocket callback; do not add a client snapshot store.
- Partition the `actionEntries` from `web/src/useTabEntries.ts:10` with `tab.pane ?? 'left'`. Render one pane when `secondaryTab` is absent and two side-by-side panes when present. Each pane gets its own `TabStrip`; translate its local callbacks back to the full server indices for select, close, rename, and split.
- Keep the `ReportingSection` at `web/src/App.tsx:222` outside `CenterActionArea`, so it spans the complete center width beneath both panes. Keep `AppShell`'s sidebars at `web/src/AppShell.tsx:30` unchanged.
- Store one divider percentage in local state owned by `CenterActionArea`, initialized to 50 on each reload. Reuse `ResizeButton` and `beginResizeDrag` with the 15–85 percentage clamp already used by `ReportingSection`; browser flex sizing handles the panes without measurement observers or pixel-width state.
- Do not put the split width in `web/src/useLayoutState.ts`: its setters call `client.reportLayout` at `web/src/useLayoutState.ts:42`, which would incorrectly make the divider server/profile state.

### 6. Separate visible bodies from the globally focused body

- Derive the two visible entries directly from `activeTab` and optional `secondaryTab`. Both selected bodies render; only `tabs[activeTab]` is `active` for command routing, caret/focus, window shortcuts, pickers, dialogs, and question overlays.
- Update `web/src/ShellTabLayer.tsx:15` `"ShellTabLayer"` and `web/src/MountedViewLayers.tsx:29` `"MountedViewLayers"` to accept both visible labels and the focused label. Keep every PTY/editor/page mounted, display both selected layers, and pass `active` only to the focused one so existing xterm resize observers, editor buffers, and page state continue to work.
- Extend `web/src/useTabHandles.ts:9` `"useTabHandles"` with label-keyed agent input/transcript maps, matching its existing harness/shell maps and the editor map at `web/src/App.tsx:122`. Resolve the active label in `useFocusOnTabSwitch`; render global picker/dialog/queue/question UI only in the focused body.
- Gate global keyboard listeners in `web/src/ImageTab.tsx` and `web/src/MarkdownTab.tsx` behind an `active` prop so two visible views cannot both respond. Preserve `EditorTab`'s existing distinction between mounted/visible and `active`.
- Focus a pane on capture-phase pointer interaction before a descendant sends an active-tab RPC. WebSocket ordering then keeps commands targeted to the clicked pane. For a cross-origin `PageTab` iframe, cover the unfocused page with a transparent focus catcher; the first click focuses/selects the pane, after which iframe interaction is enabled.
- Keep center as one application section in `web/src/useSectionNav.ts`. `Shift+Tab` entering center focuses the globally active pane, not both visible inputs.

### 7. Add the shared Split control only to existing headers

- Create the small shared `web/src/SplitTabButton.tsx` because the same exact accessible control appears in nine existing headers. Use the already-installed Font Awesome `faTableColumns` through `web/src/icons.ts`, a native button, and exact `title="Split"` and `aria-label="Split"`; add no dependency or generalized header-action API.
- Thread an optional indexed split callback through `web/src/AgentTabMeta.tsx:23` `"AgentTabMeta"` for agent, harness, and shell bodies; through `web/src/editor/EditorMetaRow.tsx:22` `"EditorMetaRow"`; and through the existing headers in `web/src/FileNavigatorHeader.tsx:20`, `web/src/ImageTab.tsx:66`, `web/src/MarkdownTab.tsx:32`, `web/src/PageTab.tsx:30`, and `web/src/SchedulesTab.tsx:86`.
- In `web/src/ViewTabBody.tsx:16` `"ViewTabBody"`, pass the callback to file navigator, image, Markdown, and schedules branches. Keep notifications unchanged because `web/src/NotificationsTab.tsx:33` only renders its dock-cycle header when docked, where Split must be absent.
- Keep monitor tabs unchanged because `web/src/ReportingSection.tsx:12` classifies them as reporting tabs rather than center action tabs.

### 8. Round-trip profile pane placement

- Extend `src/profile/types.ts:41` `"ProfileTab"` with optional `pane: CenterPane`. Carry it through a narrow profile-only agent entry type, `ProfileHarnessEntry`, and `MainAreaCandidate`; do not add it to general `AgentState`, which is also the relaunch persistence shape.
- Extend `src/profile/schema.ts:36` `"tabProblems"` to accept only `"left"` and `"right"` and emit the existing located validation style for all three entry kinds. Have `src/profile/file.ts:16` `"mapAgent"`, `src/profile/file.ts:23` `"mapHarness"`, and `src/profile/editors.ts:20` carry the optional value unchanged; apply the missing-value left default once in the profile placement pass.
- Include pane on candidates created at `src/profile/agent-opener.ts:65` and `src/profile/editors.ts:36`. After the numbering pass at `src/profile/agent-opener.ts:77`, call one batch `TabManager` placement operation for only this launch's created/reused candidates.
- In that batch, preserve unrelated tab placement, treat omitted panes as left, and choose the lowest-numbered launched candidate for the active and secondary slots. If a pane receives no launched candidate, retain its existing valid selection.
- Apply `focusedMainAreaLabel` after pane placement so the existing lowest-numbered `focus: true` winner becomes `activeTab` and selects/focuses its pane. With no focus request, preserve the existing first-new focus rule while retaining both per-pane selections.
- Add explicit pane values to the nested tab objects produced by `src/profile/save-entries.ts:14` `"writeAgentEntry"`, `src/profile/save-entries.ts:24` `"writeEditorEntry"`, and `src/profile/save-entries.ts:45` `"writeHarnessEntry"`. An unsplit tab writes `"left"`; do not change save-summary counts or `ProfileLayoutFile`.
- Keep current skip behavior for unsupported tab types. Pane placement does not make image, page, Markdown, SSH, reporting, or undocked utility views newly profile-saveable.

### 9. Update specifications and user documentation

- Update `product/specs/tabs.md` with pane creation, membership, independent strips, global focus, all navigation aliases, unread visibility, collapse, new-tab placement, and the exact Split action eligibility.
- Update `product/specs/sidebars.md` to state that docking is independent of center splitting and docked tabs belong to neither center pane.
- Update `product/specs/profiles.md` with `tab.pane`, the missing-value left default, batch launch selection/focus behavior, explicit save output, and excluded divider/selection state.
- Update `documentation/user-documentation/getting-started/tabs.md:24` `"Reading the tab strip"`, `documentation/user-documentation/getting-started/tabs.md:34` `"The tab metadata row"`, and `documentation/user-documentation/getting-started/tabs.md:48` `"Switching and reordering"` with the visible two-pane workflow and shortcuts.
- Update `documentation/user-documentation/automation/profiles.md:54` `"tab presentation"` and `documentation/user-documentation/automation/profiles.md:80` `"profile save"` with `tab.pane`, its default, and explicit saved placement.

## Tests

- Add `src/tab/split.test.ts` for first split, one-tab no-op, both move directions, same-pane restoration, source-empty collapse, invalid/docked/reporting targets, stable label selections through reordering, and normalization invariants.
- Extend `src/tab/manager.test.ts`, `src/tab/navigate.test.ts`, and `src/tab/creators.test.ts` for pane-aware select/open/close/dock/undock/rehydrate behavior, same-pane fallback, global cycling, and new-tab inheritance.
- Cover pane-local reorder neighbors, group boundaries, global numbering, persistence callbacks, two visible read labels, hidden unread tabs, and clearing on selection in `src/tab/split.test.ts`, `src/tab/navigate.test.ts`, and `src/tab/manager.test.ts`; do not create separate one-helper test files.
- Extend `src/message-handler.test.ts`, `web/src/ws.test.ts`, and `web/src/useServerState.test.ts` for the new RPC and synchronized active/secondary state, folding state-event assembly into the existing message-handler initialization coverage.
- Add `web/src/CenterActionArea.test.tsx` for two filtered strips, local-to-global index mapping, focus-before-action ordering, both visible bodies, collapse, divider clamping/reset, exact Split label/tooltip, and docked absence. The shared button does not need a separate one-component suite.
- Extend `web/src/App.test.tsx`, `web/src/MountedViewLayers.test.tsx`, `web/src/ShellTabLayer.test.tsx`, `web/src/EditorTab.test.tsx`, `web/src/PageTab.test.tsx`, `web/src/ImageTab.test.tsx`, `web/src/MarkdownTab.test.tsx`, and `web/src/useSectionNav.test.ts` for visible-versus-active rendering, label-keyed refs, inactive iframe focus interception, one active keyboard handler, and one center focus target.
- Extend `web/src/AgentTabMeta.test.tsx`, `web/src/HarnessTab.test.tsx`, `web/src/ShellTab.test.tsx`, `web/src/FileNavigatorTab.test.tsx`, `web/src/SchedulesTab.test.tsx`, and `web/src/ViewTabBody.test.tsx` for eligible Split controls. Extend `web/src/NotificationsTab.test.tsx` and `web/src/ReportingSection.test.tsx` for their deliberate absence.
- Extend `web/src/keyboard-handlers.test.ts` and `web/src/useWindowKeys.test.ts` for pane-local Ctrl+arrow reorder and pane-crossing Shift+arrow/Cmd+Shift+bracket navigation.
- Extend `src/profile/validate.test.ts`, `src/profile/file.test.ts`, `src/profile/editors.test.ts`, `src/profile/focus.test.ts`, and `src/profile/agent-opener.test.ts` for both pane values, missing-value left default, invalid values, per-pane lowest-number selections, focus winner, legacy/left-only unsplit launch, multiple right entries, and unrelated-tab preservation.
- Extend `src/profile/save.test.ts` for explicit pane output on captured agents, harnesses, and editors; unsplit `"left"` output; launch/save round-trip; and omission of pane state from relaunch and layout data.

## Out of scope

- Bottom, horizontal, nested, or more-than-two-pane layouts.
- Persisting split membership, pane selections, focused pane, or divider position through `--relaunch`; explicit profile pane placement is supported.
- Synchronizing divider position between connected clients.
- Saving pane selections or divider position in a profile.
- Expanding `profile save` to unsupported view kinds.
- Adding metadata/header rows to tab kinds that do not already have them.
- Empty-pane placeholders or a separate tab chooser.
- Dragging tabs between panes or using reorder shortcuts to cross pane boundaries.
- Rendering one tab body in both panes.
- Changing or merging the existing sidebar docking system or splitting the reporting section.

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`.

Manually open at least three center tabs, including a harness and a file-backed view. Split the harness and verify that the prior tab returns on the left, the harness stays focused on the right, both bodies remain interactive, and the reporting area and sidebars remain full-size and independent. Select different tabs in both strips; verify Ctrl+arrows reorder only inside the focused pane while Shift+arrows, Cmd+Shift+brackets, `next`, and tab navigation cross panes. Confirm output in either visible selection creates no unread badge, while a hidden tab does. Move and close tabs until each pane becomes empty in turn and confirm the survivor normalizes to one full-width strip.

Connect a second client and verify pane membership, both selections, and focus synchronize while divider positions remain independent. Save the session as a profile, verify every captured agent, harness, and editor has explicit `tab.pane`, launch that profile from an unsplit session, and verify pane placement and focus return without persisting the divider or per-pane selections.
