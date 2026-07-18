# Hover-driven connections & schedule windows

**Complexity: 4/10** — client-side only (no protocol/server change), but a small hover/pin/auto-fade timing state machine wired across two different render surfaces: agent tabs (meta bar + panels both inside the single rendered `AgentTabBody`) and harness tabs (meta bar in `HarnessTab`, panels a sibling in `MountedViewLayers`, all tabs always mounted). Several components plus a new hook and CSS.

Today the `connections` and `schedule` windows float permanently at the top-right of the active tab whenever they have content (`web/src/StatusPanels.tsx`). This feature makes them **button-driven**: the tab metadata bar gains a connections button and a schedule button. Hovering a button shows its window; clicking pins the window open until the button is clicked again; and each time a tab becomes active its non-empty windows auto-show and then fade away after 5 seconds. When a window has no content its button is dark and unclickable (no hover state) but carries a tooltip explaining why. This keeps the two windows discoverable without leaving them permanently occluding the transcript.

## Design decisions

1. **Windows keep their current top-right position.** The `connections`/`schedule` windows render where `StatusPanels` renders them today (top-right, schedule stacked below connections). Only their *visibility* changes — driven by hover/pin/auto-fade instead of always-on. The panels' markup, titles, and row rendering are unchanged.

2. **Two buttons in the metadata bar.** `web/src/AgentTabMeta.tsx` (the `.tab-meta` bar, used by both agent and harness tab bodies) gains a **connections** button (a plug icon) and a **schedule** button (a clock icon), placed alongside the existing `tab-open-files` / `tab-launch-agent` buttons. Add `faPlug` and `faClock` exports to `web/src/icons.ts` (which already aliases FontAwesome icons, e.g. `faFolder as openFilesIcon`).

3. **Active vs empty button states.**
   - **Has content** (the tab's `connections`/`schedule` array is non-empty): the button is active — normal color, clickable, hover-responsive, tooltip `connections` / `schedule` (matching the window titles).
   - **Empty**: the button is rendered dark and non-interactive (disabled — no click, no hover-open, no hover cursor), with a tooltip `no active connections` / `no active schedules`. The corresponding window never appears.

4. **Hover shows, click pins.** For an active (non-empty) button:
   - Pointer over the button (or over its window, where the window accepts pointer events — see Decision 8) shows the window; leaving hides it — unless it is pinned.
   - Clicking the button pins the window open so it stays regardless of pointer position; clicking again unpins and closes it.

5. **Auto-show on every focus, fading after 5s.** Each time a tab *becomes the active tab*, each of its non-empty windows auto-shows immediately, then fades out to disappear after 5 seconds (a CSS opacity transition, not an instant hide). This happens on every activation of the tab, not just the first time in a session.

6. **Hovering during the auto-show cancels the fade and hands control back to hover mode.** If the pointer moves onto the button (or the window) during the 5-second auto-show, the pending fade is cancelled and the window reverts to normal hover behavior: it stays while hovered and hides when the pointer leaves (unless the user clicks to pin). Clicking the button at any point — during the auto-show, mid-fade, or after it has disappeared — pins/reopens the window.

7. **Scope: which buttons a tab gets mirrors today's `scheduleOnly` predicate; web only.** Agent tab bodies (`web/src/AgentTabBody.tsx`) show both buttons. Harness tabs reuse the exact predicate already used for their panels (`scheduleOnly={t.harness!.name !== 'ssh'}`, `web/src/MountedViewLayers.tsx:54`): a **non-ssh** harness tab shows only the schedule button (the harness tab *is* the terminal connection), while an **ssh** harness tab — which today already shows a connections panel with its `ssh:<destination>` row — shows **both** buttons, so this change never regresses the ssh connections window. Other view tabs (editor, markdown, image, file-tree) render their own metadata headers, not `AgentTabMeta`, so they get neither button. The terminal/Ink UI (`ConnectionWindow`/`ScheduleWindow` via `src/cli.tsx`) is unchanged — hover and fade are pointer concepts with no terminal analog.

8. **Harness schedule window keeps pointer-events disabled.** On a harness tab the schedule panel currently disables pointer events so it never intercepts terminal input (see `product/specs/scheduling.md` "Schedule window"). That stays: on harness tabs only the *button* is a hover target, not the window itself. On agent tabs the window accepts pointer events so hovering it (per Decision 6) keeps it open.

9. **Visibility/timer state lives in a shared hook, lifted to each surface's common parent.** A new hook `web/src/useStatusWindows.ts` owns, per tab, each window's pinned/hovered flags and the 5-second auto-fade timer, and re-arms the auto-show whenever that tab becomes active. It exposes, per window, whether it is currently visible (and its fading opacity) plus the handlers the button and window need (pointer enter/leave, click). Because the meta bar and the panels are separate components, the hook is instantiated at the point that renders both for a given tab:
   - **Agent tabs:** in `web/src/AgentTabBody.tsx`, which renders both `AgentTabMeta` (`:86`) and `StatusPanels` (`:101`).
   - **Harness tabs:** in `web/src/MountedViewLayers.tsx`, inside the per-tab map that renders both `HarnessTab` (which holds the meta bar) and its sibling `StatusPanels` (`:50,:54`). The button state/handlers are threaded through `HarnessTab` into its `AgentTabMeta`.
   `AgentTabMeta` renders the buttons and wires them to the hook's handlers; `StatusPanels` reads the hook's visibility/opacity. This keeps the buttons in the meta bar and the windows top-right, as decided, without merging the two components.

## What already exists (reuse, don't rebuild)

| Need | Reuse | Location |
|---|---|---|
| The two window panels + their row rendering | `StatusPanels` | `web/src/StatusPanels.tsx` |
| Connections / schedule data per tab | `tab.connections`, `tab.schedule` on `TabView` | `web/src/StatusPanels.tsx:10-11`; `src/protocol.ts` (`TabView`) |
| The metadata bar + its icon-button pattern | `AgentTabMeta` (`tab-open-files`, `tab-launch-agent` buttons) | `web/src/AgentTabMeta.tsx:33-52` |
| Icon exports (FontAwesome aliases) | `web/src/icons.ts` | e.g. `faFolder as openFilesIcon` at `web/src/icons.ts:4` |
| Harness schedule-only predicate (ssh keeps connections) | `scheduleOnly={t.harness!.name !== 'ssh'}` | `web/src/MountedViewLayers.tsx:54`; prop at `web/src/StatusPanels.tsx:9,11` |
| Where meta + panels are rendered together (agent) | `AgentTabBody` | `web/src/AgentTabBody.tsx:86-101` |
| Harness meta bar | `AgentTabMeta` inside `HarnessTab` | `web/src/HarnessTab.tsx:44-51` |
| Harness panels (sibling of `HarnessTab`, per tab, always mounted) | `StatusPanels` in `MountedViewLayers` | `web/src/MountedViewLayers.tsx:44-62` (panel at `:54`) |
| Panel / meta-bar styling | `web/src/theme.css` (`.status-panels`, `.tab-meta`, `.panel`, `.tab-open-files`) | `web/src/theme.css` |

## Proposed changes

**`web/src/useStatusWindows.ts` (new hook).** Owns per-window state for the active tab: `pinned` and `hovered` booleans plus an auto-fade timer/phase, for each of `connections` and `schedule`. Its inputs are the counts (or emptiness) of the active tab's connections/schedule and a stable identity for the active tab (e.g. its `label`) so it can detect a focus change. On an active-tab change it re-arms the auto-show for each non-empty window (sets it visible, starts the 5s timer whose expiry triggers the fade-out and then hidden). It returns, per window, a `visible` flag and a fading `opacity` (or an equivalent CSS state) plus handlers: `onButtonEnter`, `onButtonLeave`, `onButtonClick`, `onWindowEnter`, `onWindowLeave`. Entering during the auto-show clears the fade timer (Decision 6); clicking toggles `pinned`. Keep the module under the 200-line limit and give it a colocated `web/src/useStatusWindows.test.ts`.

**`web/src/AgentTabMeta.tsx`.** Add the connections and schedule buttons after the existing buttons. `AgentTabMeta` is shared by agent tabs (via `AgentTabBody`) and harness tabs (via `HarnessTab`), so add optional props carrying, per window, whether it has content (drives active vs dark/disabled), the active vs empty tooltip, and the hook's enter/leave/click handlers; when a window's props are absent the button is not rendered (so a non-ssh harness omits the connections button, and any surface not passing them — should one arise — shows nothing). Consider extracting a small `StatusWindowButton` presentational subcomponent (its own file) so `AgentTabMeta` stays within the 200-line limit; if extracted, colocate its test.

**`web/src/StatusPanels.tsx`.** Change from "render whenever non-empty" to "render according to the hook". Accept, per window, a `visible` flag and fading `opacity`/class from the hook, and the `onWindowEnter`/`onWindowLeave` handlers (wired only where the window is a pointer target — agent tabs). A window with content renders only while the hook says visible, applying the fade transition; an empty window still renders nothing. Keep the existing titles, row classes, and `scheduleOnly` handling.

**`web/src/AgentTabBody.tsx`.** Instantiate `useStatusWindows` for `current`, pass its per-window state/handlers into `AgentTabMeta` (`:86`, buttons) and `StatusPanels` (`:101`, windows).

**`web/src/MountedViewLayers.tsx` and `web/src/HarnessTab.tsx`.** Inside the harness per-tab map (`web/src/MountedViewLayers.tsx:44-62`), instantiate `useStatusWindows` for each harness tab (using `t.label === current.label` as its active signal so the auto-show arms when the tab is shown), gating the connections window on the existing `t.harness!.name !== 'ssh'` predicate. Thread the button state/handlers through `HarnessTab` (new optional props) into its `AgentTabMeta`, and pass the window state/handlers into the sibling `StatusPanels`. Leave the harness schedule window's pointer events disabled (Decision 8), so on harness tabs only the button is the hover target.

**`web/src/icons.ts`.** Add `faPlug` (connections) and `faClock` (schedule) exports, following the existing alias pattern.

**`web/src/theme.css`.** Add styles for the two meta-bar buttons: an active state (matching the existing icon buttons) and a dark, non-interactive empty state (dimmed, default cursor, no hover response). Add the opacity fade transition used by the auto-show on the `.status-panels`/`.panel` elements.

**Specs.** Update `product/specs/connection.md` ("Connection window") and `product/specs/scheduling.md` ("Schedule window") to describe the new button-driven/hover/auto-fade behavior for the web app, keeping the terminal/Ink description as-is.

## Tests

- **`web/src/useStatusWindows.test.ts`** (new): auto-show arms on active-tab change for non-empty windows and hides after the 5s timer; entering during the auto-show cancels the fade and keeps it visible; clicking pins (stays visible without hover) and clicking again unpins; an empty window never becomes visible. Use fake timers for the 5s fade.
- **`web/src/AgentTabMeta.test.tsx`** (extend): an active button renders clickable with the `connections`/`schedule` tooltip and fires the hover/click handlers; an empty button renders dark/disabled with the `no active connections` / `no active schedules` tooltip and does not fire handlers; when the connections-window props are omitted (non-ssh harness) the connections button is not rendered, and when present (agent, ssh) it is.
- **`web/src/StatusPanels` test** (extend or add `web/src/StatusPanels.test.tsx`): renders a window only when the hook marks it visible; applies the fading opacity; still renders nothing for an empty window; respects `scheduleOnly`.

## Out of scope

- The terminal/Ink UI (`ConnectionWindow`/`ScheduleWindow`): unchanged; the always-on panels remain there.
- Connections button on **non-ssh** harness tabs (they stay schedule-only, matching today's panel). SSH harness tabs keep their connections window and so get both buttons.
- Buttons on non-agent, non-harness view tabs (editor, markdown, image, file-tree): none.
- Any change to what the windows *contain* or to the underlying `connections`/`schedule` data model — this is purely a visibility/interaction change.
- No persistence of pin state across relaunch or tab switches; the auto-show re-arms fresh on each activation.

## Open questions

None.

## Verification

- Run `./scripts/run.mjs check-diff` after each change (lints changed files, typechecks affected projects, runs web tests for the touched components).
- Manual end-to-end check:
  1. In an agent tab with an open shell and a scheduled timer, switch to that tab — confirm both windows auto-show top-right and fade away after ~5 seconds.
  2. Before they fade, move the pointer onto a window — confirm the fade cancels and the window stays while hovered, then hides when the pointer leaves.
  3. Hover the connections button — confirm the connections window shows; move away — it hides. Click the button — it stays pinned; click again — it closes.
  4. In a tab with no connections, confirm the connections button is dark and unclickable with tooltip `no active connections`; likewise the schedule button with no timers.
  5. On a non-ssh harness tab, confirm only the schedule button is present (no connections button) and the schedule window still does not intercept terminal input. On an ssh tab, confirm both buttons are present and the connections window still shows the `ssh:<destination>` row.
