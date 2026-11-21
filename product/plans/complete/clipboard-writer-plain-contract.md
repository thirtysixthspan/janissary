# One plain clipboard-writer contract, with the SQL grid owning its copy-failure fallback

**Complexity: 4/10** — ~45 added lines across 3 production files, 5 behavioural requirements and 8 test scenarios, one new function (p=5.09).

## Goal

The shared clipboard writer should expose one plain, one-argument contract to the application at large, and the copy that has something to say when the system clipboard refuses should learn the outcome without making every other caller carry a feature-specific callback. Today `web/src/shared/system-clipboard.ts` exports `copyText(text, onFailure?)`, where `onFailure` exists solely for the SQL grid's error band while roughly ten other callers omit it. The shared primitive therefore carries one feature's error UI, and a second caller with different failure behaviour would either lose the copy silently or add another branch to a helper everyone uses.

After the change `copyText(text)` stays a fire-and-forget write for every existing call site, and a new `tryCopyText(text): Promise<boolean>` performs the same write and reports whether it landed. The SQL grid is the only caller of the promise form and keeps its own error wording in its own file. Every copy still reaches the one clipboard-capture seam exactly once, whether or not the browser accepted the write.

## Approach

**Two explicit forms, one capture seam.** `writeClipboardText` stays the private, feature-detected `navigator.clipboard.writeText` attempt that resolves `true` or `false` and never throws. `copyText(text)` keeps its early return on empty text and becomes a plain fire-and-forget call: it starts the write and calls `captureCopiedText(text)` once. `tryCopyText(text)` returns the write's boolean instead of discarding it, and calls `captureCopiedText(text)` once on the same path. Both forms capture regardless of the outcome, because a browser withholding the clipboard is a reason the text did not reach the operating system, not a reason the user did not copy it. An empty copy stays a no-op on both the clipboard and the capture seam, matching the existing pinned behaviour.

**The plugin boundary is respected.** A tab plugin may not reach into a host module, which is why the SQL grid imports the writer through `web/src/plugins/api.ts` rather than from `shared/`. The promise form is published there additively, alongside `copyText`, so `TAB_PLUGIN_API_VERSION` does not move and no `TabPluginClientCapabilities` field changes. The test that pins the published export string is updated to name both forms.

**The fallback stays in the feature.** The SQL grid's copy handler calls `tryCopyText(text)` and invokes its existing `onError` with the existing `Copy is unavailable here. Select and copy this text: …` wording only when the promise resolves `false`. No shared module knows that string. The grid's `if (!text) return` stays, so it never asks the promise form to copy an empty selection.

No user-visible behaviour changes: the success copy, the silent failures everywhere else, the grid's error band, and the clipboard-history entry all read exactly as before. The existing spec and user documentation already describe them.

## Implementation steps

1. In `web/src/shared/system-clipboard.ts`, drop the `onFailure` parameter and its feature-specific comment. Keep `copyText(text): void` as the one-argument fire-and-forget form, and add `tryCopyText(text): Promise<boolean>` returning the outcome of `writeClipboardText` and calling `captureCopiedText(text)` exactly once. Preserve the empty-text early return and the no-throw behaviour in both forms. Update the leading comments to explain the two forms instead of the removed callback.
2. In `web/src/plugins/api.ts`, publish the promise form beside the existing one from `../shared/system-clipboard`, and update the comment above the export to describe both. Publishing is additive; the plugin API version is untouched.
3. In `web/src/plugins/sql/selection.tsx`, import `tryCopyText` from `../api` in place of `copyText`, call it from the copy-chord handler, and call `onError` with the existing error string only when the result is `false`. Replace the comment that explains the `onFailure` callback with one that explains the promise form.
4. In `web/src/shared/clipboard-captures.test.ts`, update the published-writer assertion to name both exported forms.
5. Run `$janissary/scripts/run.mjs check-diff` after each step.

## Tests

`web/src/shared/system-clipboard.test.ts` — keep every existing `copyText` assertion byte-for-byte and add a `tryCopyText` block covering: resolves `true` after a successful write; resolves `false` and does not throw when the browser withholds the clipboard; resolves `false` when `writeText` rejects; publishes the captured text exactly once on success and exactly once on a refused write; publishes nothing and resolves `false` for an empty copy.

`web/src/plugins/sql/Selection.test.tsx` — no edit. Its existing cases pin the grid's error text on a refused write and the captured text on a successful one; they must still pass byte-for-byte.

`web/src/shared/clipboard-captures.test.ts` — the published-writer assertion names both forms; the invariant that only the seam's own writer may call `navigator.clipboard.writeText` is unchanged.

## Spec

None needed: this is a behaviour-preserving refactor. The observable copy and fallback behaviour is already recorded in `product/specs/sql-database.md` and `documentation/user-documentation/tab-types/sql-browser.md`, and neither the wording nor the outcome changes.

## Out of scope

- Adding a failure callback or promise form to `TabPluginClientCapabilities` / `capabilities.copyText`; the grid uses the published module function, as it does today.
- A second feature adopting `tryCopyText` before it needs it.
- Changing any copy wording, the clipboard-capture seam, the plugin API version, or the capture history's contents.
- Editing the SQL grid's pinned test assertions or the other one-argument call sites.
