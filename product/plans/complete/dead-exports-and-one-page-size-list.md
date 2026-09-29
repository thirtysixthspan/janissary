# Drop the sql plugin's dead exports and unify the page sizes

**Complexity: 3/10** — two deletions, one payload field, and moving one source of truth from the
server to the client. The new field is the only thing that touches the wire contract.

## Goal

`rowLabel` in `web/src/plugins/sql/grid-view.ts` and `databaseFromKey` in `src/plugins/sql/tabs.ts`
are exported and called by nothing. The page-size list `[50, 100, 500]` is written out three times —
in `src/plugins/sql/tabs.ts`, in `src/plugins/sql/shared-intents.ts`, and in
`web/src/plugins/sql/grid-view.ts` — so the guard that decides whether a page size is acceptable and
the control that offers them are two independent copies that can drift.

The copy that matters is the guard's. A page size added to the control is refused by the intent
handler; a page size added to the guard never appears in the control. Neither failure is loud.

## Approach

Delete the dead exports, and make the payload carry the sizes.

The server already owns the list — the guard reads it — so publishing it in the tab payload means the
client renders from the same array the guard checks against, and there is nothing to keep in step. The
`client` project's `@shared/plugins/...` alias already resolves the shared contract, so the client
needs no new import of a server module; it reads the field and drops its own constant.

## Implementation steps

1. **`web/src/plugins/sql/grid-view.ts`** — delete `rowLabel` and the `PAGE_SIZES` constant. The
   `Pager` will read the list from the payload instead.
2. **`src/plugins/sql/tabs.ts`** — delete `databaseFromKey` and the unused `PAGE_SIZES`, and add
   `pageSizes` to the payload `emptyPayload` builds, from the one list in `shared-intents.ts`.
3. **`src/plugins/sql/shared.ts`** — declare `pageSizes: number[]` on `SqlPayload` and extend
   `isSqlPayload` to check it: an array of numbers, every one of which the guard would accept. That
   last clause is what keeps the copy honest — a payload carrying a size the host would refuse is a
   payload this plugin produced wrong.
4. **`web/src/plugins/sql/Pager.tsx`** — render the options from `payload.pageSizes`.

## Tests

`src/plugins/sql/shared.test.ts` gains a case that the payload guard accepts a well-formed `pageSizes`
and rejects one holding a value the intent guard refuses — the check that makes the copy safe to
publish. `web/src/plugins/sql/grid-view.test.ts` drops its `PAGE_SIZES` import and keeps every other
case. Every existing server test must keep passing; `src/plugins/sql/activate.test.ts` builds
payloads by hand in one place and is the file that will notice if the new required field was missed.

## Out of scope

- The page size's default. It stays 100 and is a separate constant, because a default is a choice the
  grid makes while the list is a choice the control offers.
- Making the client's copies of anything else derive from the payload. The sizes are the one list
  whose server copy is a *guard* rather than a rendering preference.
- `knip`, which would have caught the two dead exports. This plan does not add it.
