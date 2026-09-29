# Highlight the e2e browser flag green while a browser is in use

**Complexity: 5/10** — no new architecture: the change publishes a browser-started report beside the existing browser-gone one and follows that report's path exactly, locally and across a remote connection. The breadth is the cost. The remote leg is a new server frame, which means a protocol version bump, a decoder, the channel's frame routing, and the manager's handler, each with tests. The flag itself is a server-side decision in `tabView` plus one display entry and one CSS rule on the client.

A `-b` harness tab shows a globe icon in its metadata row from the moment it launches, whether or not a browser has been started behind its endpoint. The browser is connect-triggered, so most of the time that icon means "this tab may start a browser", not "a browser is running". The specs already name what is missing: "A flag that tracked a live browser would need janissary to publish a browser-started event beside the browser-gone one, on the tab and across a remote connection."

## Goal

While a browser is running behind a `-b` tab's endpoint, the globe icon in the metadata row is green and its tooltip reads "E2E browser in use". Before the first browser starts it is the plain globe with the "E2E browser" tooltip, as today. When a browser is reported gone the icon drops, as today, and the gone-browser band and notification are unchanged. If a later connect starts a fresh browser, the icon returns, green, because a browser is in use again; the band stays as the record of the earlier death.

## Approach

1. **`src/browser/e2e-server.ts`**: `E2EBrowserOptions` gains `onStarted?: () => void`, invoked each time a browser behind the guard starts listening. `LazyBrowser` keeps it, and `startBrowser` calls it once the child is listening, outside the start's `try` so a throwing callback is never mistaken for a failed launch.
2. **`src/harness/scratch-dir.ts`** (`harnessSpawnEnv`): takes a required `onBrowserStarted` beside `onBrowserGone` and passes it as `onStarted`.
3. **Tab state**: `HarnessView` gains `browserRunning?: boolean`, set by a new `reportBrowserStarted(managers, label)` in `src/harness/browser-started.ts` and cleared by `reportBrowserGone`. Local spawn (`src/harness/tab-spawn.ts`) wires it.
4. **Remote**: `src/remote/serve-processes.ts` sends a new `browser-started` server frame `{ type, id }`. Add it to `ServerFrame` and `SERVER_FRAME_TYPES` (`protocol-frames.ts`), decode it in `decode-lifecycle.ts` / `decode.ts`, route it as a channel frame (`channel/types.ts`), and handle it in `entry-factory.ts` with `notifyBrowserStarted` in `manager-reports.ts`, which resolves the tab by session id and calls `reportBrowserStarted`. `notifyBrowserGone` clears `browserRunning` too. Bump `REMOTE_PROTOCOL_VERSION` to 23 with a version note: a version-22 remote never sends the frame, and a version-22 local side would refuse it as unknown.
5. **`src/tab/view.ts`**: the browser flag becomes `browserInUse` while `harness.browserRunning` is set, `browser` while the tab was launched with `-b` and no browser has been reported gone, and absent otherwise. Extract the decision into a small pure helper.
6. **Client**: `web/src/shared/tab/flag-display.ts` gains a `browserInUse` entry (same globe, label "E2E browser in use", an optional `className`). `AgentTabMeta` appends the entry's class to `tab-flag`, and `theme.css` colors `.tab-flag--active` with `var(--success)`.

## Implementation steps

1. `e2e-server.ts` `onStarted`.
2. `scratch-dir.ts` and `tab-spawn.ts` wiring, `HarnessView.browserRunning`, `browser-started.ts`, `browser-gone.ts` clearing.
3. `view.ts` flag helper.
4. Remote frame: protocol types, version bump and note, decoder, channel routing, entry-factory handler, `manager-reports.ts`, `serve-processes.ts`.
5. Client display entry, `AgentTabMeta` class, CSS.
6. Tests below, then specs.

## Tests

- `src/browser/e2e-server-lazy.test.ts` (or the lifecycle test that already drives a start): `onStarted` fires once a connect-triggered browser is listening, and not for a start that fails.
- `src/harness/browser-started.test.ts`: `reportBrowserStarted` sets `browserRunning` on the named harness tab and ignores an unknown label; `reportBrowserGone` clears it (in the existing browser-gone coverage).
- `src/tab/view.test.ts`: the flag is `browserInUse` while running, `browser` before any start, absent after a reported death, and `browserInUse` again after a fresh start following a death.
- `src/remote/protocol.test.ts` / frame decode tests: `browser-started` round-trips and a frame without an id is malformed; the version pin moves to 23.
- `src/remote/manager-reports.test.ts` (or its existing home): `notifyBrowserStarted` marks the tab resolved by session id; `notifyBrowserGone` clears it.
- `src/remote/serve-processes` test: a `-b` spawn's browser start sends `browser-started` for that session id.
- `web/src/shared/AgentTabMeta.test.tsx`: a `browserInUse` flag renders the globe with the active class and the "E2E browser in use" label; a plain `browser` flag does not carry the class.

## Spec

- `product/specs/tabs.md`, Metadata row: the browser flag is green while a browser is running, plain before one starts, dropped on a reported death, and green again for a fresh browser after one.
- `product/specs/harness.md`, the metadata-row paragraph of End-to-end browser: the same, from the harness side.

## Docs

`documentation/user-documentation/getting-started/tabs.md` and `advanced-agents/harness.md` both describe the 🌐 flag, and the first says it stays gone after a death; both are updated in place.

## Out of scope

- Clearing the gone-browser band when a fresh browser starts. The band is the record of a death and its lifetime is unchanged.
- Restoring the running state onto a remote tab rebuilt by a reattach from a new local session. A frame sent while detached is queued and replayed like `browser-exited`, but a browser that started before the local side went away is not re-announced; its flag shows plain until the next start.
- Any change to the browser lifecycle itself: the guard, the restart budget, or the connect-triggered start.
