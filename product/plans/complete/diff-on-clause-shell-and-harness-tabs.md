# Restrict the `on <tab name>` clause to shell and harness tabs

**Complexity: 4/10** — two additive fields on the `originTab` record, one narrowing in the diff plugin's resolution, and the tests that pin both; no capability change and no behavior change for any tab the clause already accepts.

The clause's wording in `product/specs/diff-tab.md`, the usage line, and the no-workspace refusal all name "an open shell or harness tab". `resolveWorkspace` in `src/plugins/diff/activate.ts` accepts any open tab whose record carries a workspace, so the set the clause accepts is whatever happens to inherit a workspace directory rather than what the spec says, and the refusal reads as false the first time a name outside that set resolves one.

## Goal

`diff on <tab name>` answers the no-workspace refusal for a tab that is neither a shell tab nor a harness tab, and opens the workspace diff for a tab that is one — exactly the two the spec describes. Every route the clause already serves keeps working, including the remote one.

## Approach

Verified against the code before building on the entry: the tabs whose record carries a workspace today are `view: 'harness'` tabs (`src/harness/tab-spawn.ts` is the only maker that passes a workspace directory) and `view: 'plugin'` tabs whose `plugin.id` is `shell` (`src/tab/openers.ts` sets `workspaceDir` from the launch's own clone, its adoption, or a source's confinement; `makeFilesTab` passes none). The entry's proposal named `view` alone, and that is not enough on its own — a record's view is `'plugin'` for a shell tab and for every other plugin's, so view alone cannot tell a shell tab from a navigator tab. The record therefore gains the view and, for a plugin tab, that plugin's id, and the plugin names the exact pair the spec promises. Both are additive, so `TAB_PLUGIN_API_VERSION` stays at 2.

The diff-tab activation test's fake records are built through a `shellRecord` helper rather than inline literals, because a fake that answers a bare workspace would have blended the narrowing away — the tests that pin it have to answer records a real launch would produce.

## Implementation steps

1. `src/plugins/line-capabilities.ts` — the record `originTab` returns gains `view?: Tab['view']`, read from `tab.view`, and `plugin?: string`, read from `tab.plugin?.id`. Both omitted for a tab that has neither, so a plain agent tab's record is exactly what it was.
2. `src/plugins/api.ts` — name both in the `originTab` contract, beside the `workspace` field they qualify and the `remote` field that decides which of the two it is read from.
3. `src/plugins/diff/activate.ts` — `resolveWorkspace` answers `none` for a record whose view is neither a harness tab nor one of the shell plugin's own tabs, which falls into the refusal the clause already returns. The local and remote routes are unchanged.
4. `product/specs/diff-tab.md` — no edit; the wording it already carries is what the code will then do.

## Tests

- `src/plugins/context.test.ts`, in the `originTab with a label` block — the record names a shell tab's view with its plugin id, an editor tab's view, and omits both for a plain agent tab.
- `src/plugins/diff/activate.test.ts` — `diff on <name>` for a files-tab record, an editor-tab record, and another plugin's record, each carrying a workspace, refuses with the existing wording and opens no tab; a harness-tab record and a shell-tab record beside them still open theirs.
- `src/plugins/launch-tab.test.ts` — a launched tab carries the view and plugin id the record's narrowing reads, so the source of the field is pinned against a real launch rather than only against a fake record.

## Out of scope

- The `openSibling` route, which the host hands a tab it has already resolved and which keeps its own host-side guard.
- The sessions row's action list, which keeps `diff` off a channel that has not landed its workspace.
- Any other consumer of `originTab`.
