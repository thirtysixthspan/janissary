# Remove the Duplicated Window Counts from the Connection-Tab Spec

**Complexity: 1/10** — a one-paragraph spec wording correction that restores the consolidation's non-numeric history wording; no code, schema, or behavior changes.

## Goal

Make `product/specs/acp-records.md` the only spec that names the 20-block history window and its paging increments by leaving `product/specs/connections-tab.md` with the non-numeric history wording the earlier consolidation established, while keeping the tab-scoped window lifetime rule and the `[[acp-records]]` link.

## Approach

The later `release-connection-window-on-tab-close` repair added the tab-scoped lifetime sentence but restated the window size three times: "newest 20 prompt blocks", "20 older blocks", and "newest 20 blocks again". An earlier `reconcile feature docs and acceptance` pass had already replaced the numeric phrases with "newest history window"/"older blocks" after `consolidate-connection-tab-follow-and-window-rules` made `acp-records.md` the sole owner of the window size and paging increments. Restore that non-numeric phrasing inside the existing paragraph: keep every other sentence, including the tab lifetime sentence, and keep the existing `[[acp-records]]` link. Do not add a section, do not restate the window size, and do not touch the completed plans.

## Implementation steps

1. In `product/specs/connections-tab.md` under "The connection tab", replace "The tab opens on the newest 20 prompt blocks and loads 20 older blocks when the reader reaches the top" with "The tab opens on the newest history window and loads older blocks when the reader reaches the top", keeping the rest of the sentence, the viewport preservation, and the `[[acp-records]]` link unchanged.
2. In the same paragraph, replace "reopening the tab loads the newest 20 blocks again" with "reopening the tab loads the newest history window again", preserving the tab-scoped lifetime rule word for word otherwise.
3. Read the edited paragraph to confirm it no longer names a count, still links to `[[acp-records]]` for the window and its paging, and keeps the lifetime sentence.
4. Confirm `product/specs/acp-records.md` still states the default size of 20 and the 20-block paging increments, and that `product/specs/connection.md`'s `[[connections-tab]]` pointer is unchanged.
5. Run `npm run docs:build` and confirm every `[[...]]` target used by the edited spec resolves to a file in `product/specs/`.

## Tests

- `product/specs/connections-tab.md` contains no "20".
- The paragraph still links to `[[acp-records]]` for the window and its paging.
- The tab-scoped window lifetime sentence is unchanged apart from its non-numeric closing phrase.
- `product/specs/acp-records.md` remains the only spec that states the 20-block window size and paging increments.
- `product/specs/connection.md` is unchanged.
- `npm run docs:build` succeeds.

## Out of scope

- Changing code, tests, schemas, or runtime behavior.
- Changing the window size, count validation, offset, `hasOlder`, or paging increments in `acp-records.md`.
- Editing the completed plans, which remain historical records.
- Adding or updating user documentation where no existing page names the window size.
