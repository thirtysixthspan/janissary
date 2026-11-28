# Record the MCP start failure without forging Managers or a Tab

**Complexity: 3/10** — ~8 added lines, 2 files, 5 requirements, 4 test scenarios (p=4.38)

## Goal

`McpManager.recordFailure` builds a shadow `Managers` with `Object.create(managers)`, a shadow tab manager with `Object.create(managers.tab)`, and a `cur()` that returns `{ label: 'janus', dotColor: undefined } as unknown as Tab`. It does that only so `notify` can read an active label when the server fails before any tab exists. Any later change to `notify` or `deliverNotification` that writes a field on `managers` or the tab manager, or reads more of the cast `Tab`, would silently write into the shadow or read `undefined`, and the user's one failure notice would be lost or corrupted. This fix removes the forgery. `notify` gets a documented answer for "no tab is active yet", and the MCP manager calls it directly on every failure path, so exactly one `mcp-failed` notification is still recorded.

## Requirements

1. The backlog entry says to "delete the `Object.create` fallback and call `notify(managers, 'mcp-failed', 'janus', detail)` directly": `McpManager.recordFailure` calls `notify` with the real `managers` on every failure, whether or not a tab exists.
2. The backlog entry says "if a path can still run with no current tab, give `notify` in `src/notifications/index.ts` a documented fallback for a missing `cur()`": `notify` called while the tab manager holds no tabs records the notification instead of throwing.
3. With no tab open, no tab counts as active, so an ambient event is not suppressed for focus when its config toggle is on.
4. The backlog entry says "Keep exactly one notification": a state-file failure inside a real `createManagers` call records exactly one `mcp-failed` notification.
5. That notification reads `MCP server failed to start: <reason>` with the reason verbatim and is attributed to `janus`, as `product/specs/mcp-server.md` already states.

## Design decisions

- The fallback lives in `notify`, not in a startup yield. The backlog proposal suggested making `start` yield first so the root tab exists, but the root tab is not open when `createManagers` returns: `TabManager` starts with no tabs and `openLaunchShell` opens the `janus` tab later, asynchronously, through the shell plugin (Assumption 2, 3). A port-in-use failure also arrives asynchronously and can still beat the launch shell. A yield would not remove the no-tab case, so it is not added.
- `notify` reads the active label as "none" when the tab manager holds no tabs, and otherwise as `cur().label` exactly as today, so `cur()`'s fall back to the first tab is unchanged (Assumption 1).
- `shouldNotify` accepts `activeLabel: string | undefined`. No tab label equals `undefined`, so the focus rule never fires with no active tab, which is the honest answer when nothing is focused.
- `TabManager.cur()`'s `Tab` return type is not widened. It has many callers that run only after the launch shell exists, and widening it would spread `undefined` handling across the codebase for one startup path.
- The `Tab` type import leaves `src/mcp/manager.ts` with the cast.

## Preserved behavior

1. A port-in-use failure records exactly one `mcp-failed` notification attributed to `janus` carrying `MCP server failed to start: <reason>`; it must not record zero or two, and must not change the message shape. Pinned by "records one failure notification and stays down when the port is taken" in `src/mcp/manager.test.ts`.
2. A broken state file records one `mcp-failed` notification with the file path and remedy in its reason and leaves the file untouched; it must not throw out of the constructor or rewrite the file. Pinned by "names the state file and the remedy when it is not valid JSON" in `src/mcp/manager.test.ts`.
3. An ambient event on the currently active tab is still suppressed; the no-tab fallback must not turn off focus suppression while a tab is active. Pinned by "is suppressed for the currently active tab (focus suppression)" in `src/notifications/index.test.ts`.
4. A notification's header still reads `<time> <label>` with the tab's dot colour; it must not lose the colour or duplicate the label. Pinned by "renders a manual notification as `<time> <label>: <message>` without duplicating the label" in `src/notifications/index.test.ts`.

## Assumptions

1. `src/tab/manager.ts:54` `cur(): Tab { return this.tabs[this.activeTab] ?? this.tabs[0]; }` returns `undefined` at runtime when `tabs` is empty, despite its type.
2. `src/tab/manager.ts:47` "Starts with no tabs: the first is the launch shell, which `openLaunchShell` opens once every manager exists".
3. `src/index.ts:66` `await openLaunchShell(controller.managers);` runs after `createController` returns, and `src/launch-shell.ts:13` awaits `managers.plugins.runCommandResult(...)`, so the root tab arrives after at least one asynchronous step.
4. `src/controller/create-managers.ts:57` `managers.notifications = new NotificationQueue();` and `:59` `managers.tab = new TabManager(...)` are constructed before `:67` `managers.mcp = new McpManager(managers, projectDir);`, so a synchronous failure inside the constructor finds both.
5. `src/notifications/tab.ts:24` `notificationsFeedVisible` returns before calling `cur()` when no notifications tab exists, so the delivery path reads no active tab once `notify` has passed.

## Existing functionality

1. `src/notifications/index.ts:200` `export function notify(` is the single notification path the fix routes through.
2. `src/notifications/index.ts:155` `export function shouldNotify(` holds the focus rule `if (tabLabel === activeLabel) return false;`.
3. `src/tab/transcript/state.ts:42` `const activeLabel = this.tabs[this.activeTab]?.label;` is the precedent for treating the active label as possibly absent.
4. `src/controller/create-managers.test.ts:133` `createController({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} }, projectDir)` builds a controller over a chosen project directory, so a test can plant a state file first.
5. `src/notifications/queue.ts:105` `get all(): readonly RecordedNotification[]` exposes the recorded notifications for assertion.

## Implementation steps

Step 1, notifications. In `src/notifications/index.ts`, widen `shouldNotify`'s `activeLabel` parameter to `string | undefined` and extend its comment to say no active tab suppresses nothing for focus. In `notify`, read the active label as `undefined` when `managers.tab.tabs` is empty and as `managers.tab.cur().label` otherwise, with a comment naming the startup window before the launch shell opens. Build command: `$janissary/scripts/run.mjs check-diff`.

Step 2, MCP manager. In `src/mcp/manager.ts`, reduce `recordFailure` to one `notify(managers, 'mcp-failed', SYSTEM_LABEL, detail)` call and drop the `Tab` type import. Build command: `$janissary/scripts/run.mjs check-diff`.

Step 3, tests as listed below. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

None. The notification line, toast, and feed entry are unchanged; only the internal route to them changes.

## Tests

- `src/notifications/index.test.ts`: `notify` with a tab manager holding no tabs records an explicit `mcp-failed` notification in the queue without throwing (Requirement 2).
- `src/notifications/index.test.ts`: `shouldNotify` with an `undefined` active label lets an ambient event through when its toggle is on (Requirement 3).
- `src/mcp/manager.test.ts`: a state-file failure with a tab manager holding no tabs, the real empty-tabs shape rather than a fixture tab, still records one `mcp-failed` notification attributed to `janus` (Requirement 1, 5).
- `src/controller/create-managers.test.ts`: a corrupt `.janissary/mcp.json` planted before a real `createController` call leaves exactly one `mcp-failed` notification in `managers.notifications` reading `MCP server failed to start: invalid MCP state file <path>; ...` (Requirement 4, 5).

## Out of scope

- Widening `TabManager.cur()`'s return type or changing any other caller of it.
- Delaying the MCP start until the launch shell exists.
- Any change to the notification's wording, event classification, alert defaults, or the MCP state-file rules.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and confirm lint, typecheck, and the server tests pass.

Then the manual check: in a scratch project, write `{"port":` into `.janissary/mcp.json` and start Janissary there. The app should start normally, `mcp` should print `not running` with the reason `invalid MCP state file <path>; delete it and restart Janissary to replace it`, and `notifications` should open a feed holding exactly one line `janus: MCP server failed to start: invalid MCP state file <path>; delete it and restart Janissary to replace it`. A crash at startup, a missing line, or two lines means the fix is wrong.
