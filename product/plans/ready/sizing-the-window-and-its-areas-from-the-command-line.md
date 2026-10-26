# Sizing the window and its areas from the command line

**Complexity: 4/10** — one new command over layout plumbing that already exists, but it spans server and web: one new field on the `layout` event and `reportLayout` RPC, a hoisted split divider, a new notification event, completion, and four spec updates.

## Summary

Feature request (verbatim from `product/backlog/features.md`): "Sizing the window and its areas from the command line. add a `layout` command with three forms: `layout window <width> <height>`, `layout sidebar left|right <width>`. `layout existing` would print the current sizes. `layout split <width>` sets an existing split tab with a width."

A profile can already size the application window, both sidebars, and the tab-area split through its `layout` key (`profiles.md` § Profile-level layout), but nothing typed into a command bar can. A runscript, a scheduled command, or a `send` therefore has no way to set the layout, and the center split divider has no non-drag control at all. This plan adds one `layout` command that sets those sizes on demand and prints what they are now, as commands that recreate them.

## Design decisions

Each decision is settled by the feature text, by behavior the app already has, or by the user's answer, as stated.

### Forms and units

1. **One new built-in command, `layout`.** It lives in `src/commands/layout.ts` and is registered in `src/commands/index.ts`, per architecture principle 5. No bundled plugin claims `layout` today, so the name is free.
2. **Five forms.** `layout window <width> <height>` sizes the application window. `layout sidebar left|right <width>` sizes one sidebar. `layout split <percent>` sizes the center split. `layout reporting <percent>` sizes the lower reporting area. `layout show` prints the current sizes. The user added the reporting form to this version, because it's the fourth size a profile's `layout` key already carries (`tabAreaPct`). Keywords and the side match without regard to case, like every other command.
3. **`layout show`, not `layout existing`, prints the sizes.** The user chose `show` over the backlog's `existing`. Bare `layout` prints the usage message rather than the sizes.
4. **`layout split` acts on an existing split.** The feature text says it "sets an existing split tab with a width", so the command never creates a split. The server already knows whether one is showing: `managers.tab.secondaryTabLabel` is defined exactly when the client draws two panes (`src/state/event.ts` derives `secondaryTab` from it, and `CenterActionArea` splits on `secondaryTab !== undefined`).
5. **`layout split` takes the left pane's percent of the center area.** `layout split 60` gives the left pane 60% and the right pane 40%. That's how the divider already stores its position, and it keeps its proportion when the window is resized. The user chose this over pixels.
6. **`layout reporting` takes the lower reporting area's percent of the height.** `layout reporting 25` gives the reporting area 25% and the tab area 75%. That's the section the drag handle sits on, and the share `ReportingSection` already stores. A profile's `tabAreaPct` names the other share, so the command sends `100 - percent` as `tabAreaPct`. The user chose this keyword and share over `layout tabarea` with the upper share.
7. **Window and sidebar widths are pixels.** That matches the profile `layout` key (`window.width`/`window.height`, `sidebar.left`/`sidebar.right`) and the `--window-size=1280,800` launch flag. The window size is Chrome's outer window size, which is what both `resizeAppWindow` sets and `getAppWindowBounds` reads, so `layout show` round-trips it.
8. **Sizes are applied exactly, like a profile's.** The command never clamps to the drag-resize limits (sidebar 180px to half the window, split 15–85%, reporting 15–85%) or to the screen. It refuses only what can't be a size. Pixels must be positive whole numbers. A split percent must be a whole number from 1 to 99, so both panes stay on screen. A reporting percent may be any whole number from 0 to 100, which can hide either area entirely, the same range a profile's `tabAreaPct` already allows. The user chose the wider reporting range so that `layout show` can print any reporting share a profile set as a line that runs. This matches `profiles.md` § Profile-level layout, where a profile's numbers are "trusted as authoritative". A later drag still clamps as it does today. The OS or Chrome may still cap a window larger than the screen; the command doesn't check the size it got.

### Edge cases

9. **A hidden sidebar still takes the width.** When nothing is docked on that side, `layout sidebar left 400` sets the width anyway and succeeds as usual. The sidebar opens at 400px the next time something docks there. A profile's `layout` already behaves this way. The user chose this over refusing. A hidden reporting area works the same way: with no reporting tab open, `layout reporting 30` sets the share anyway, and the reporting area opens at 30% the next time a reporting tab appears.
10. **No window means the window form does nothing, silently.** Under `--no-open`, or when the CDP pipe never came up, no resizer is registered. `layout window` then changes nothing and replies with nothing, matching `profile launch`, which skips the window size with no note. The user chose this over a refusal reply.
11. **A failed window resize is reported in a notification.** When a window is open but the CDP resize call rejects, the failure goes to the notifications feed as `Could not resize the window: <reason>.` The reason is the error's first line with terminal punctuation trimmed and one period added, the same rule the system shell startup notice uses. Chrome rejects a resize of a maximized or full-screen window this way, for example. The user chose a report over the silent stderr warning `profile launch` writes (`src/profile/layout.ts` `resizeWindow`), and chose a notification as its channel. A failure differs from having no window: the user asked for a size and didn't get it.
12. **`layout split` with no split replies `No split is showing.`** It changes nothing. The user chose this over a longer message with a hint.
13. **Sizes last like a drag.** A size set by `layout` resets on relaunch, the same as a dragged one. `profile save` captures the window, both sidebars, and the reporting split exactly as it captures dragged sizes today. The split divider stays uncaptured.
14. **Every connected client follows a `layout` change, and `layout show` reads the last report.** The `layout` event is broadcast, so two open windows both move. When they report different sizes, the last report wins, the same rule `profile save` already follows (`src/client-layout.ts`).
15. **A change made while no client is connected is dropped.** Under `--no-open` before any browser attaches, `layout sidebar`, `layout split`, and `layout reporting` emit an event that reaches no one, and a client that connects later starts at its own defaults. Success stays silent. A profile's layout behaves the same way today. The user chose this over holding the sizes for the next client, which would also have changed how a profile's layout behaves.

### Replies

16. **Success prints nothing.** The four set forms reply with nothing when they succeed, the same as `tab focus` and `execute` (`application-commands.md`). The user chose this over a confirmation line. It also keeps a runscript's transcript quiet.
17. **`layout show` prints re-runnable commands.** Each line is the `layout` command that recreates one size, so the output can be pasted straight into a runscript. The lines come in a fixed order: window, left sidebar, right sidebar, split, reporting. A line that doesn't apply is left out: the window line when no window is open, and the split line when the center isn't split. The sidebar and reporting lines are printed whenever a client has reported, whether or not those areas are showing. The user chose this over labeled lines. For example:
    `layout window 1440 900`
    `layout sidebar left 400`
    `layout sidebar right 300`
    `layout split 60`
    `layout reporting 25`
18. **`layout show` prints a hidden sidebar's width.** The width still exists and applies when something docks there (Design decision 9), so leaving it out would make the output recreate a different layout. The user chose this over printing only visible sidebars, and confirmed the same for a hidden reporting area.
19. **`layout show` rounds each size to a whole number.** A drag leaves fractional values, such as a 312.5px sidebar or a 62.5% split, and the parser accepts only whole numbers (Design decision 8). Rounding to the nearest whole number keeps every printed line runnable, which is the reason the user chose this output. A rounded split always lands inside 1–99, because a drag clamps it to 15–85 and nothing else sets it.
20. **A failed window size read leaves out the window line and is reported in a notification.** When a window is open but the bounds read rejects over CDP, `layout show` prints its other lines as usual, leaves out the window line, and sends the notification `Could not read the window size: <reason>.` The reason follows the same rule as Design decision 11. The user chose this over leaving the line out silently.
21. **One usage line for every mistake.** Bare `layout`, an unknown subcommand, a missing or extra word, an unknown side, and an invalid number all reply exactly `Usage: layout window <width> <height> | sidebar left|right <width> | split <percent> | reporting <percent> | show.` This matches the one-line `Usage: tab focus <name>.` style. The user chose it over a multi-line usage and over a specific message per mistake.
22. **`layout show` with nothing to print is reported in a notification.** When no window is open and no client has reported its sizes yet, as under `--no-open` with no browser connected, there is no line to print. That case sends the notification `No layout to show.` rather than producing an empty reply. The user chose a notification over a transcript line or silence, and chose this text over a longer one naming the reason.
23. **All three notifications use a new explicit `layout` event.** The three lines are `Could not resize the window: <reason>.`, `Could not read the window size: <reason>.`, and `No layout to show.` The event has no config toggle, bypasses focus suppression, and is attributed to the tab `layout` ran in, like `open-unsupported`, which also moved a command's error out of the transcript. Nothing is written to that tab's transcript for any of them. Its `notifications.alerts` entry defaults to a desktop banner with the `warning` cue, the same default as `schedule-late` and the launch events, since nothing is lost and the user only needs to retry. The existing config backfill (`application-config.md`, "event types missing from `alerts`") adds the `layout` key to an older `.janissary/config.json` on the next start. The user chose a new event over `layout-failed` or reusing `manual`, the warning cue over the error cue or feed-only, and notification-only over also writing the transcript.
24. **Tab completes the command.** The user added this to this version. Tab completes the `layout` subcommand keywords and the `left`/`right` side of the sidebar form, the way `browser` subcommands complete today. A number position falls through to file-path completion, as every command's free arguments already do.

### How sizes move

25. **The window is resized and read over CDP.** The command uses the same registered resizer `profile launch` uses (`getWindowResizer()` in `src/window-resizer.ts`) and the bounds reader `profile save` uses (`getWindowBoundsReader()`). Both are registered together in `openApp` (`src/app-window.ts`) and cleared by `closeApp`.
26. **Sidebar, split, and reporting sizes reach the client by the existing `layout` event.** The server emits a `LayoutUpdate` on the message bus, `wireControllerEvents` (`src/controller/events.ts`) forwards it to `sendLayout`, it is broadcast to every connected client as `{ t: 'layout', … }`, and `useLayoutState` patches only the fields the event carries. The split travels as a new optional `splitPct` field, the left pane's percent.
27. **The split divider becomes server-visible for the first time.** `CenterActionArea.tsx` holds it today as `leftPct` in local state, starting at 50% and clamped to 15–85% when dragged, never reported and reset on reload (`tabs.md` § Split tab strips). It moves into `useLayoutState` beside the sidebar widths, and is reported with them. It still resets on reload.
28. **The server's held copy is updated in two ways.** First, the client reports its sizes once on connect, in addition to after each drag as today, so the server holds real values before anyone drags. The report fires on mount and again whenever `client.onConnectionStatus` publishes `connected`, because `send` drops a call made before the socket opens (`web/src/shared/ws/rpc-exchange.ts` `send`). Second, the `layout` bus subscriber in `wireControllerEvents` merges every emitted size into the held copy (`src/client-layout.ts`), so `layout show` reads the new value immediately rather than racing the client's round trip. That matters for a runscript that runs `layout sidebar left 400` then `layout show` on the next line. It also means `profile save` captures sizes a profile launch applied, which it misses today. A client never reports back after applying a `layout` event; the existing no-echo test in `web/src/useLayoutState.test.tsx` stays as it is.
29. **Parse pure, execute effectful.** A pure parser turns the input into a structured form or `{ error }`, and the command's `run` does the effects (architecture principle 4).

## What already exists (reuse, don't rebuild)

| Need | Existing code |
| --- | --- |
| Command definition, registry, dispatch order, and `samples` shadowing guard | `src/commands/types.ts`, `src/commands/index.ts`, `src/commands.test.ts` |
| Pure parser beside a command | `src/commands/parse-close.ts` |
| A command claiming its whole first token, success silent, usage on anything else | `src/commands/tab.ts` (`match: /^tab(?:\s|$)/i`) |
| Appending a command's reply to the transcript | `appendCommandOutput` in `src/command/append.ts` (see `src/commands/theme.ts`) |
| Reporting a command's error as a notification instead of in the transcript | `notify(managers, 'open-unsupported', label, …)` in `src/open/file-manager.ts` |
| App window resize over CDP, registered only when a window is open | `src/window-resizer.ts`, `src/cdp-window-resize.ts` (`resizeAppWindow`), `src/app-window.ts` |
| App window size read over CDP | `getAppWindowBounds` in `src/cdp-window-resize.ts`, `getWindowBoundsReader()` |
| Server → client sizing event, patch-only semantics | `LayoutUpdate` in `src/protocol/events.ts`, `messageBus.emit('layout', …)` in `src/profile/layout.ts`, the `layout` subscriber in `src/controller/events.ts`, `sendLayout` in `src/index.ts`, `client.onLayout` in `web/src/shared/ws/ws.ts` |
| Client → server size report and server-side holder | `reportLayout` in `src/protocol/core-rpc.ts`, its guard in `src/client-params/core.ts`, `controller.reportLayout` in `src/controller.ts`, `setClientLayout`/`getClientLayout` in `src/client-layout.ts`, `client.reportLayout` in `web/src/shared/ws/ws.ts` |
| Client connection-phase subscription | `client.onConnectionStatus` in `web/src/shared/ws/ws.ts`, as `web/src/editor/useEditorSync.ts` uses it |
| Hoisted client sizing state, already spread into `AppMain`'s props | `web/src/useLayoutState.ts` (`LayoutState`), `web/src/AppMain.tsx` (`AppMainProps = LayoutState & …`) |
| Center split divider and its drag limits | `web/src/CenterActionArea.tsx` (`MIN_PCT` 15, `MAX_PCT` 85, initial 50) |
| Sidebar width limits and default | `web/src/Sidebar.tsx` (`MIN_WIDTH_PX` 180, `MAX_WIDTH_PCT` 50, `DEFAULT_WIDTH_PX` 300) |
| Server knowledge of whether the center is split | `managers.tab.secondaryTabLabel` |
| Subcommand completion | `completeSyntaxTheme` in `src/completion/handlers.ts`, `completeWord` in `src/completion/helpers.ts`, the chain in `src/completion/index.ts` |
| Keyword list exported from a pure parser for completion to import | `BROWSER_SUBCOMMANDS` in `src/browser/command.ts`, imported by `src/completion/browser.ts` |
| Profile `layout` precedent for units and no-window behavior | `src/profile/layout.ts` (`applyProfileLayout`), `src/profile/save/reserved.ts` (`buildLayout`) |
| Help table row, kept alphabetical | `help.md` (Commands table), checked by `src/commands.test.ts` |

## Proposed changes

### Server

- **`src/commands/parse-layout.ts`** (new). `parseLayoutCommand(input)` is pure. It returns one of five structured forms or `{ error }` carrying the usage line from Design decision 21: window (width and height), sidebar (side and width), split (percent), reporting (percent), or show. It validates numbers per Design decision 8. It also exports the subcommand keyword list (`window`, `sidebar`, `split`, `reporting`, `show`) that completion offers, so the two can't drift. The parser is its own module rather than part of `layout.ts` so that completion can import the keyword list without pulling in the command's notification and CDP imports, the same split `src/browser/command.ts` makes for `BROWSER_SUBCOMMANDS`.
- **`src/commands/layout.ts`** (new). The `layout` `Command`, with `match` accepting `layout` followed by whitespace or the end of input, like `src/commands/tab.ts`, and `samples` naming each form. `run` parses, then:
  - A parse error appends the usage line through `appendCommandOutput`.
  - Window form: with no resizer registered, returns. Otherwise awaits the resizer, and on a rejection calls `notify(managers, 'layout', tab.label, …)` with the line from Design decision 11.
  - Sidebar form: emits a `LayoutUpdate` carrying only `sidebarLeft` or `sidebarRight`, whether or not that sidebar is showing.
  - Split form: appends `No split is showing.` when `managers.tab.secondaryTabLabel` is undefined, and otherwise emits a `LayoutUpdate` carrying only `splitPct`.
  - Reporting form: emits a `LayoutUpdate` carrying only `tabAreaPct`, set to `100 - percent`.
  - Show form: reads `getClientLayout()` and, when a reader is registered, awaits the window bounds reader. A rejected read leaves out the window line and calls `notify` with the line from Design decision 20, and the rest of the form carries on. It appends the lines from Design decision 17, rounded per Design decision 19. The sidebar and reporting lines are present whenever a layout is held, and the split line only when `managers.tab.secondaryTabLabel` is defined. With no line to print, it calls `notify(managers, 'layout', tab.label, 'No layout to show.')` and appends nothing.
  - The set forms append nothing on success.
- **`src/commands/index.ts`**. Import the command and add it to `coreCommands`. Its position is free, since `commands.test.ts` fails any shadowing either way.
- **`src/protocol/events.ts`**. `LayoutUpdate` gains an optional `splitPct`, documented as the left pane's percent of the center area. The comment above the type, which says the event carries only "a profile's" sizes, now also names the `layout` command.
- **`src/protocol/core-rpc.ts`**, **`src/client-params/core.ts`**, **`src/controller.ts`**. The `reportLayout` params gain a required `splitPct`, the guard checks it with `isFiniteNumber` like its siblings, and `controller.reportLayout`'s parameter type follows. The RPC's comment changes from "after a manual resize completes" to "on connect and after a manual resize completes". Client and server ship together, so the field is required rather than optional.
- **`src/client-layout.ts`**. `ClientLayout` gains `splitPct`. A new `patchClientLayout(update)` merges whichever of `sidebarLeft`, `sidebarRight`, `tabAreaPct`, and `splitPct` the update carries into the held layout, and does nothing when no layout is held yet, since that event reached no client either. `buildLayout` in `src/profile/save/reserved.ts` ignores `splitPct`, which keeps the split out of saved profiles (Out of scope).
- **`src/controller/events.ts`**. The existing `layout` subscriber calls `patchClientLayout` with the update before forwarding it to `sinks.sendLayout`.
- **`src/notifications/index.ts`**, **`src/notifications/alert-defaults.ts`**, **`src/notifications/format.ts`**. Add `'layout'` to `NotificationEventType` and to `EXPLICIT_EVENTS`, give it `{ desktop: true, sound: 'warning' }` in `NOTIFICATION_ALERT_DEFAULTS`, and add it to the `return detail ?? ''` group in the formatter's switch beside `open-unsupported`. Both maps are keyed by the union, so a missed one fails typecheck.
- **`src/completion/handlers.ts`**. Add `completeLayoutCommand(cursor)` beside `completeSyntaxTheme`, which has the same shape: it returns `null` for any other command, completes the first argument from the parser's keyword list, and completes the second argument after `sidebar` from `left`/`right`. Add it to the chain in `completeCommandLine` (`src/completion/index.ts`) beside `completeSyntaxTheme`. No new completion module is needed; `handlers.ts` counts about 42 lines.

### Web

- **`web/src/CenterActionArea.tsx`**. Export the initial divider percent as a named constant, the way `Sidebar.tsx` exports `DEFAULT_WIDTH_PX` and `ReportingSection.tsx` exports `DEFAULT_PCT`. Replace the local `leftPct` state with a controlled prop and setter. The drag handler still clamps to `MIN_PCT`/`MAX_PCT` before calling the setter.
- **`web/src/CenterActionAreaProps.ts`**. `BaseCenterActionAreaProps` gains the split percent and its setter, which reaches `CenterActionArea` through `AppCenterActionArea`.
- **`web/src/useLayoutState.ts`**. Adds the split percent and a reporting setter to `LayoutState`, applies `splitPct` from a `layout` event without reporting back, and passes the split percent in every `reportLayout`. Adds the connect report from Design decision 28: once on mount and again on each `connected` phase from `client.onConnectionStatus`, sending the current sizes.
- **`web/src/shared/ws/ws.ts`**. `reportLayout` gains the split percent as a fourth argument and sends it as `splitPct`.
- **`web/src/App.tsx`** and **`web/src/AppMain.tsx`**. Pass the two new `LayoutState` fields through to `AppCenterActionArea`. `AppMainProps` already includes `LayoutState`, so only the destructuring and the props change. `App.tsx` counts about 166 of its 200 lines, so two more fit.

### Docs and specs

- **`help.md`**. A `layout` row in its alphabetical place, between `launcher` and `monitor`, reading exactly as the user chose (180 characters, under the 200-character limit `src/commands.test.ts` enforces):
  `` | `layout` | `layout window <width> <height>`, `layout sidebar left\|right <width>`, `layout split <percent>`, or `layout reporting <percent>` sets a size; `layout show` prints the current ones | ``
- **`documentation/user-documentation/command-bar/commands.md`**. A row in the user-facing commands table carrying the same description as the `help.md` row.
- **`product/specs/application-commands.md`**. A new `### layout` section with every form, the exact replies and notification lines, and the edge cases above.
- **`product/specs/notifications.md`**. Add `layout` to § Events that notify with its three exact lines, and to the lists of no-toggle explicit events, focus-suppression bypasses, desktop alerts, and `warning` cue defaults.
- **`product/specs/profiles.md`** § Profile-level layout. A `tabAreaPct` of 0 or 100 now has a command equivalent, `layout reporting 100` or `layout reporting 0`.
- **`product/specs/sidebars.md`**. § Resizing says the width can also be set by `layout sidebar`. § What's server-owned vs. client-owned is corrected: widths are reported to the server and captured by `profile save`, which the spec today denies.
- **`product/specs/tabs.md`** § Split tab strips. The divider can also be set by `layout split`, and its size is reported to the server, though it still resets on reload.
- **`product/specs/profiles.md`** § Saving. Sizes set by `layout`, by a profile launch, or by a drag are all captured, and sizes a client has never changed are captured too.

### Implementation order

Land these in order so typecheck and tests stay green at each step:

1. The `splitPct` field end to end: `LayoutUpdate`, the `reportLayout` params and guard, `ClientLayout`, `patchClientLayout` and its call in `src/controller/events.ts`, then the web side (hoisted divider, `useLayoutState`, `ws.ts`, the `App`/`AppMain` threading). The required RPC field and the client call that sends it must change together.
2. The `layout` notification event in the three notification modules.
3. `parse-layout.ts`, `layout.ts`, the registry entry, and the `help.md` row together, since `commands.test.ts` reads both.
4. Completion.
5. Specs and user docs.

## Tests

- **`src/commands/parse-layout.test.ts`** (new). Each form parses to its structured value, keywords and side in any case. Every malformed input returns the usage error: bare `layout`, missing numbers, non-numeric or fractional numbers, zero and negative pixels, split percents of 0 and 100, reporting percents of -1 and 101, an unknown side, an unknown subcommand, and extra trailing words. Reporting percents of 0 and 100 parse. A pixel size larger than the drag limit or the screen parses unchanged.
- **`src/commands/layout.test.ts`** (new, mirroring `src/commands/theme.test.ts`). With a resizer registered, the window form calls it with the right numbers and appends nothing. With none registered, it appends nothing, sends no notification, and throws nothing. A rejecting resizer sends one `layout` notification reading `Could not resize the window: <reason>.` and appends nothing. The sidebar form emits a `LayoutUpdate` carrying only the one side, with or without a docked tab on that side. The split form appends exactly `No split is showing.` with no split showing, and emits only `splitPct` when one is. `layout reporting 25` emits only `tabAreaPct: 75`. A malformed input appends exactly the usage line. With no client connected, every set form still succeeds silently. `layout show` prints the five lines in order from a held layout and a stubbed bounds reader, rounds fractional values, leaves out the window line with no reader registered, and leaves out the split line with no split showing. A held `tabAreaPct` of 100 prints `layout reporting 0`. A rejecting bounds reader leaves out the window line, still prints the other four, and sends one `layout` notification reading `Could not read the window size: <reason>.` With no reader and no held layout, it sends the `layout` notification `No layout to show.` and appends nothing.
- **`src/client-layout.test.ts`** (extend). `patchClientLayout` merges only the fields an update carries, and does nothing when no layout is held.
- **`src/controller/events.test.ts`** (extend). A `layout` bus event patches the held layout and still reaches `sendLayout` unchanged.
- **`src/client-params/core.test.ts`** (extend). The existing `reportLayout` row gains `splitPct`; a missing or non-finite `splitPct` is rejected.
- **`src/notifications/index.test.ts`** (extend). A `layout` event is recorded even when its tab is the active one, and its alert defaults to a banner with the `warning` cue.
- **`src/completion/index.test.ts`** (extend, beside the `browser` cases). `layout ` completes the subcommand keywords, `layout sid` completes to `layout sidebar `, and `layout sidebar ` offers `left` and `right`.
- **`src/commands.test.ts`** (existing, unchanged). Fails if the new `samples` shadow or are shadowed, or if the `help.md` row is out of order.
- **`web/src/useLayoutState.test.tsx`** (extend). A divider drag reports all four sizes. A `layout` event carrying `splitPct` updates the split without reporting back. Mounting reports the starting sizes once, and a `connected` phase reports them again.
- **`web/src/CenterActionArea.test.tsx`** (extend). The divider renders the percent it is given, and the existing 15–85% drag-clamp test now asserts on the setter it calls.
- **`web/src/App.test.tsx`** (extend). The fake client gains a `reportLayout` stub, since mounting now reports. A `layout` event carrying `splitPct` moves the divider of a split view and leaves sidebar widths alone.

## Out of scope

- Creating a split. `layout split` acts only on a split that already exists, per the feature text.
- Moving, docking, or splitting tabs. Those belong to the separate `tab move`/`tab pane`/`tab dock`/`tab split` backlog entry.
- Any change to the drag-to-resize gestures themselves, including their clamps.
- Capturing the split divider in a profile. `profile save` still leaves it out and `profile launch` still starts it at 50%; the user declined this extra.
- Clamping a size to the drag limits or the screen. Sizes apply exactly as given (Design decision 8).
- A `layout existing` spelling. The show form is `layout show` only.
- Persisting sizes across relaunch outside a profile. They reset like dragged sizes (Design decision 13).
- Telling the user that `layout window` did nothing under `--no-open` (Design decision 10).
- Holding a `layout` change for a client that connects later (Design decision 15).

## Open questions

None. Every decision above was settled with the user or follows from existing behavior.

## Verification

- Run `$janissary/scripts/run.mjs check-diff`.
- Manual check: dock a file navigator on each side and split the center. Run `layout window 1440 900`, `layout sidebar left 400`, `layout sidebar right 250`, and `layout split 60`, and confirm the window, both sidebars, and the divider move to those sizes and that none of the four prints anything. Run `layout show` and confirm it prints exactly those four commands plus a `layout reporting` line. Drag the left sidebar and the divider by hand, run `layout show` again, and confirm it prints the dragged sizes as whole numbers. With no reporting tab open, run `layout reporting 30`, then start a monitor so a reporting tab opens, and confirm the reporting area appears at 30% of the height. Type `layout ` and press Tab to confirm the subcommands complete. Collapse the split and confirm `layout split 60` replies `No split is showing.` Maximize the window, run `layout window 1440 900`, and confirm the `Could not resize the window: …` notification. Run `profile save <name>` and confirm the saved `layout` key carries the window, sidebar, and reporting sizes set by `layout`. Restart with `--no-open` and no browser attached, run `layout show` from a runscript or schedule, and confirm the `No layout to show.` notification.
