# Key launchTab's provisioning and failure lookups by instance key, not label

**Complexity: 4/10** — one server module (`src/plugins/launch-tab.ts`) changes how it finds the tab it launched, and the change is local: the lookup it switches to (`managers.tab.pluginTabByInstanceKey`) already exists and is already what `notifyUser` and `setBusy` use. The risk is in timing: every lookup that moves runs asynchronously, after the clone settles or after the failure delay, so the tests have to drive fake timers through a close-and-relaunch sequence to show the old label-keyed behavior was wrong.

After `launchTab` opens a plugin tab with a workspace clone, every later lookup of that tab goes through `ownTabExists(managers, pluginId, label)`, which matches any tab of the plugin carrying that label. A failed `zsh docs` that the user closes and retypes within `PROVISION_FAILURE_CLOSE_DELAY_MS` therefore has its replacement `docs` shell closed — and that shell's new clone cancelled — by the first launch's timer. Likewise a cancelled clone whose rejection arrives after a same-named relaunch posts a stale `Failed to create workspace` line and schedules a close of the new tab.

## Goal

Every lookup of the launched tab that runs after `launchTab` returns resolves the tab by the launch's own `instanceKey`, so a first launch's delayed close, failure line, busy reset, and ready-handler rejection can only ever act on the tab that launch opened. A same-named relaunch is untouched by anything the first launch left in flight.

## Approach

1. In `src/plugins/launch-tab.ts`, add a `launchedTab(managers, pluginId, instanceKey)` helper that returns `managers.tab.pluginTabByInstanceKey(pluginId, instanceKey)`.
2. Thread `instanceKey` into `failLaunch`. Its timer looks the tab up with `launchedTab`, returns when it is gone, and otherwise closes it via `managers.tab.findIndex(tab.label)` — the found tab's label, not the launch's.
3. In `runReady`, reset `busy` on the tab `launchedTab` finds, and gate the rejection branch's `failLaunch` on `launchedTab` rather than `ownTabExists`.
4. In `awaitClone`, set `busy` on the tab `launchedTab` finds, and pass `wireProvisioning` a `tabExists` predicate that ignores the label it is handed and checks the instance key. `wireProvisioning` keeps its `label` argument for its own bookkeeping; its signature does not change.
5. Leave `openLaunched`'s post-open `ownTabExists` check as it is: it runs synchronously right after the open, before anything else could reuse the label.

## Tests

Add to `src/plugins/launch-tab.test.ts`, using its existing fake-timer setup:

- **A failed launch's delayed close spares a same-named relaunch.** The `docs` clone fails, the user closes the tab, a second `docs` launch opens; once `PROVISION_FAILURE_CLOSE_DELAY_MS` passes the second tab is still open and its clone was never cancelled by the first launch.
- **A cancelled clone's late rejection posts nothing for a same-named relaunch.** The first `docs` tab is closed while its clone is in flight, a second `docs` launch opens, then the first clone rejects; no failure line is posted and the second tab survives the delay.

The existing cases — "posts the failure and closes the tab after the delay when the clone fails", "cancels the clone when the tab closes first and never runs the ready handler", "closes only its own tab when the ready handler rejects, leaving the plugin enabled" — must keep passing unchanged.

## Spec

`product/specs/shell-tab.md` gains a sentence that a failed workspaced shell's delayed close and failure message apply only to that shell, never to a shell later opened under the same name.

## Out of scope

- `startWorkspaceAgent` in `src/profile/new-agent.ts` has the same label-keyed shape but predates this pull request and has no instance key. It is left alone here; recording it in the technical-debt backlog is outside what this task may edit, so it is reported instead.
- `wireProvisioning`'s signature and its other callers (`HarnessManager`, `ProfileManager`).
