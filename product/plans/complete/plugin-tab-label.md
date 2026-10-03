# Let a plugin tab identify itself to useStatusWindows

**Complexity: 2/10** — one optional field on the capability object, which already receives the label, and one call site.

**Goal.** Restore the five-second auto-show on a shell tab's status windows. `useStatusWindows` documents its `activeKey` as the tab's label and re-arms when it changes, and every host caller passes `tab.label` — but the capability object carried no label, so the shell row passed the constant `'shell'` and the auto-show fired once at mount and never again.

**Approach.** Expose the label the host already has. Optional, for the reason `attachTerminal` and `claimedChords` are: fourteen plugin fixtures build this object and none keys anything by a label.

## Implementation

1. Add `label?: string` to `TabPluginClientCapabilities` in `web/src/plugins/api.ts`, documented as the per-tab identity a view can key state on.
2. Return it from `createPluginClientCapabilities`, which already takes `label` as a parameter.
3. Pass `capabilities.label` to `useStatusWindows` in `web/src/plugins/shell/ShellTab.tsx`, falling back to the old constant for a host that reports none.
4. Document the field in the client capability list and raise the documented client count from thirteen to fourteen, in `documentation/developer-documentation/tab-plugins.md` and the literal `src/plugins/documentation.test.ts` pins.

## Tests

In `web/src/plugins/shell/ShellTab.test.tsx`: two shell tabs with different labels each get a status window, which is what a per-tab identity buys and a constant cannot.

`web/src/shared/status-windows/useStatusWindows.test.ts` covers the re-arm itself and is untouched.

## Out of scope

- Exposing anything else about the tab. The label is the one field a view needs to key per-tab state, and it is already the thing the host uses for the same purpose.