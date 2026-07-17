# Launch-agent button in the agent metadata row

**Complexity: 3/10** — spans server and web with one new label-scoped RPC, but every step copies the existing `openFileNavigatorFor` wiring and reuses the `agent` command's creation path.

Add a ➕ button to the tab metadata row, next to the existing 📁 file navigator button, that launches a new agent tab whose working directory is the current tab's working directory. Today the `agent` command always creates agents in the server's own working directory, so there is no one-click way to spawn an agent alongside a harness that was launched somewhere else. The button gives harness tabs (and regular agent tabs) a direct "spawn a helper right here" action, mirroring how the file navigator button already opens a file tree rooted at the tab's cwd.

## Design decisions

- **Click behavior**: clicking the button creates a bare agent tab immediately — random pool name, focused right away, joining the source tab's group — exactly like the `agent` command, except its cwd is the source tab's working directory instead of `process.cwd()`. No dialog, no name prompt.
- **Placement**: the button appears wherever the file navigator button already appears — harness tabs and agent transcript tabs — not just harness tabs. Same wiring, consistent UI.
- **Error feedback**: when the launch can't proceed (all 52 pool names in use), post the `agent` command's existing error text ("All agent names are in use.") to the notifications feed via `notify` with the `'manual'` event type, so the click gives visible feedback even from a harness tab, which has no transcript to print into. `'manual'` is the only viable event type: the five ambient types are focus-suppressed for the active tab (`shouldNotify` in `src/notifications.ts:31`, `if (tabLabel === activeLabel) return false;`), and the button's source tab is normally the active tab. Known limitation, accepted: `notify` returns without recording anything while the notifications tab is closed (`src/notifications.ts:68`, "Returns immediately … while the notifications tab is closed"), so with the feed closed a failed click gives no feedback.
- **Button wording**: ➕ icon with tooltip "New agent here".
- **cwd availability**: the button renders only when the tab has a known cwd, following the same conditional-render pattern the file navigator button already uses for its callback prop.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Metadata row with 📁 button | `web/src/AgentTabMeta.tsx:31` (`onOpenFileNavigator &&`) | Add the new button beside it, driven by a new optional callback prop, same conditional-render shape as `onOpenFileNavigator` |
| Button → server message wiring | `web/src/HarnessTab.tsx:49`, `web/src/AgentTabBody.tsx:89` | Both already send `openFileNavigatorFor { label }` on click; the new button sends the new message the same way |
| Client message handling | `src/protocol.ts:178` (`openFileNavigatorFor` in the `RpcCall` union), `src/message-handler.ts:79` (its `case`), `src/controller.ts:220` (`openFileNavigatorFor(label)` delegate) | The full path a label-scoped RPC takes; follow it exactly. There is one protocol file — the web app imports it as `@shared/protocol` (alias to `../src` in `web/tsconfig.json` and `web/vite.config.ts`), so no mirror file needs editing |
| Agent creation | `ProfileManager.newAgent` in `src/profile/manager.ts:33` | Owns name resolution, group inheritance, tab insertion, focus, persistence — extend rather than duplicate |
| Tab cwd lookup | `TabManager.cwdOf(label)` in `src/tab/manager.ts:64` | Returns the source tab's working directory (`string \| undefined`) |
| Notifications feed | `notify` in `src/notifications.ts:72` | Carries the error message when creation fails, with the `'manual'` event type |

## Proposed changes

**Protocol.** Add a new entry to the `RpcCall` union in `src/protocol.ts`: `launchAgentFor` with params `{ label: string }`, placed after `openFileNavigatorFor` (`src/protocol.ts:178`) with a doc comment in the same style. The web app picks it up through the `@shared/protocol` alias — there is no second protocol file to edit.

**Server.** Add a `case 'launchAgentFor'` to the `switch` in `src/message-handler.ts` (beside `case 'openFileNavigatorFor':` at `src/message-handler.ts:79`) that calls a new one-line controller delegate, mirroring `openFileNavigatorFor(label)` at `src/controller.ts:220`. The delegate calls a new `ProfileManager` method, `newAgentAt(label)`, in `src/profile/manager.ts`. That method looks up the source tab via `TabManager.findIndex`/`tabs` and its cwd via `cwdOf(label)`; if the label matches no tab, it returns without doing anything. It then runs the same creation path as `newAgent` (`src/profile/manager.ts:33`) — pool-name resolution via `resolveAgentName`, `distinctColor`, `makeTab`, `insertTabInGroup`, `setCwd`, `setActiveTab`, `persist` — with two differences: the creator tab is the label-resolved source tab rather than `tab.cur()` (the button can sit on a sidebar-docked tab that is not the active tab), and the new tab's cwd is the source tab's `cwdOf` value rather than `process.cwd()`. Factor the creation body out of `newAgent` into a shared helper taking the creator tab and target cwd as parameters, so neither method copies the other; `src/profile/manager.ts` is 63 lines, so the addition fits the 200-line limit. On failure (pool exhausted), call `notify(managers, 'manual', label, 'All agent names are in use.')` instead of appending to a transcript. Relative imports in `src/` carry the `.js` extension (NodeNext).

**Web.** Add an optional `onLaunchAgentHere` callback prop to `AgentTabMeta`; when present, render a button with class `tab-launch-agent`, content ➕, and `title="New agent here"` immediately after the existing `tab-open-files` button (`web/src/AgentTabMeta.tsx:31`), using the same `{onLaunchAgentHere && (...)}` conditional. Wire the prop at the two existing `openFileNavigatorFor` send sites — `web/src/HarnessTab.tsx:49` and `web/src/AgentTabBody.tsx:89` — to send `launchAgentFor { label }` (HarnessTab uses its `label` prop, AgentTabBody uses `current.label`). Pass the prop only when the tab's `cwd` is defined (`cwd` is optional on both: the `cwd` prop in `HarnessTab`, `current.cwd` in `AgentTabBody`); `ShellTab.tsx` passes neither callback and is untouched.

**Spec.** Update the "Metadata row" section of `product/specs/tabs.md` (lines 79–93, which document the 📁 button and its tooltip verbatim) to document the new button the same way: icon, tooltip "New agent here", click behavior, which tabs show it, and the notification-on-failure case. `product/specs/file-tree-tab.md` has a "Opening from a tab's metadata row" section showing the cross-reference style if one is wanted; `sidebars.md` does not describe this row and needs no change.

## Tests

- `web/src/AgentTabMeta.test.tsx`: the button renders with tooltip "New agent here" when the callback is provided, is absent when it isn't, and clicking invokes the callback — mirroring that file's existing file-navigator button tests.
- `web/src/HarnessTab.test.tsx` and `web/src/App.test.tsx`: clicking the button sends `launchAgentFor` with the tab's label, following the existing `openFileNavigatorFor` assertions ("dispatches openFileNavigatorFor with the tab label…" at `web/src/HarnessTab.test.tsx:249` and "sends openFileNavigatorFor with the active tab's label…" at `web/src/App.test.tsx:91`).
- `src/profile/manager.test.ts` (existing `describe('ProfileManager.newAgent', …)` at line 68): launching from a tab creates a new agent tab whose cwd equals the source tab's cwd and whose group matches the source tab; when all pool names are in use, no tab is created and a notification with "All agent names are in use." is recorded; an unknown label is a no-op.

## Out of scope

- No launch dialog, name prompt, or profile selection — the button always creates a bare, auto-named agent.
- No workspace clone creation (`agent --workspace` behavior stays command-only).
- No button on shell tabs (their metadata row has no file navigator button today either).

## Open questions

None.

## Verification

Run `./scripts/run.mjs check-diff`. Manual check: launch a harness tab in a directory other than the server's cwd, click ➕ in its metadata row, and confirm a new focused agent tab appears whose metadata row shows the harness's directory and whose group bar matches the harness tab. For the failure path, open the notifications tab first (the feed records nothing while closed), run `agent` repeatedly until the pool is exhausted, click ➕ again, and confirm the "All agent names are in use." notification appears in the feed.
