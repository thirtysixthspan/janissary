# Address a dispatched line to the tab answering it

**Complexity: 5/10** — one optional parameter threaded from the intent entry point to the capability, in four small modules, plus documentation. No behavior outside the intent path changes.

**Goal.** Make a line dispatched from a shell tab run in that shell tab, as `product/specs/shell-tab.md` already says it does. Today it runs in the agent tab the user typed `zsh` in, because the host builds every plugin call's origin from `plugin.sourceLabel`.

**Approach.** Thread the answering tab's label alongside the origin rather than replacing the origin. `origin` means "the tab a command was invoked from" and is load-bearing for `note` attribution, `openClaimedFiles`, and `originTab`'s documented meaning; changing it for intents would silently move all three. `dispatchLine` is the one capability whose target *is* the question, so it gets the answering label as a separate fact and prefers it.

## Implementation

1. Add an optional trailing `answeringLabel` to `createPluginContext` in `src/plugins/context.ts`, and have `dispatchLine` resolve its target from it, falling back to `origin.label` when it is absent or names a tab that has since closed.
2. Thread it through `invokePlugin` in `src/plugins/invoke.ts` and the `invoke` member of `PluginRequestPort` in `src/plugins/requests.ts`.
3. Pass `tabLabel` from `runPluginIntent`, which is the tab whose client asked — the one place that knows it.
4. Leave every other call site alone: the command, selection-action and default-menu paths pass nothing and keep resolving against `origin.label`.

## Tests

In `src/plugins/shell-capabilities.test.ts`:

- a dispatched line is run against the answering tab when one is given, and against the origin tab otherwise;
- a closed answering tab falls back to the origin tab rather than addressing a label with no tab.

`src/plugins/shell/activate.test.ts` keeps passing untouched: it stubs the capability object, so the threading is invisible to it.

## Out of scope

- Changing what a command that answers with *text* rather than opening a picker does. Its output is still appended to the addressed tab's transcript, which a shell tab does not draw; that remains a separate question from which tab is addressed, and `product/specs/shell-tab.md` is corrected here to say where the output lands.
- `note`, `openClaimedFiles` and `originTab`, whose origin semantics are unchanged by design.