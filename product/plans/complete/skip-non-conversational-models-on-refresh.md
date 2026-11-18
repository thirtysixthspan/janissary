# Skip non-conversational models when refreshing the catalog

**Complexity: 2/10** — ~17 added lines across 1 production file, 3 requirements, 6 scenarios (p=4.23); one new pure module and no new architecture.

## Goal

Refreshing from the Models tab takes whatever model ids each provider reports and merges them into the known-models catalog. Provider lists include ids that cannot hold a conversation: embeddings, text-to-speech, transcription, live-audio, image-generation, and video or music generation models. Those ids get written to `.janissary/known-models.json`, then show up in harness validation, completion, the conversation picker, and the roles picker as selectable choices that fail on first use.

The bundled catalog already excludes them, guarded by a test in `src/models/catalog-file.test.ts`, but that rule lives only in the test. A refresh reintroduces the exact models the curation deliberately removed. Refresh must never add a non-conversational id to known models.

## Approach

Give the curation rule one home in production code and apply it where refresh builds the catalog.

`src/models/conversational.ts` holds a pure predicate over a model id, using the same exclusion patterns the bundled-catalog guard already uses: `embedding`, `-tts`, `transcribe`, `-live`, a trailing `-image`, `veo`, and `lyria`. A companion helper filters a list of provider records. No state, no I/O, no provider-specific branches.

`mergeModelCatalog` filters every successful provider outcome through that helper before it syncs. Filtering at the merge seam, rather than in each fetcher or in the manager, keeps the rule in one place and keeps the merge's own counts honest: non-conversational ids are neither added nor counted. A non-conversational id already present in the catalog for a reached OpenCode prefix or a reached Claude/Codex harness falls out on that refresh, so a catalog polluted by an earlier refresh heals itself.

The bundled-catalog guard test imports the same predicate, so the curation rule and the refresh rule cannot drift apart. Rejected alternatives: matching the patterns again in the test (two definitions that can diverge), filtering in each provider (three copies of one rule), and filtering in the manager (puts a domain rule in a transport method).

## Implementation steps

1. Add `src/models/conversational.ts` exporting `isConversationalModel(id)` and `conversationalRecords(records)`. The exclusion patterns match the bundled-catalog guard exactly, so an id the bundled catalog rejects is also an id refresh refuses to add.
2. In `src/models/merge.ts`, filter each `ok` outcome's records through `conversationalRecords` before calling `mergeRecords` and `mergeOpenCode`, and before computing counts. Skipped and failed outcomes pass through unchanged, so the status-based summary still reports them.
3. In `src/models/catalog-file.test.ts`, replace the local exclusion regex with `isConversationalModel` so the bundled-catalog guard shares the rule with refresh.

## Tests

`src/models/conversational.test.ts` (new):

- `isConversationalModel` accepts ordinary conversational ids and rejects each excluded kind: embedding, `-tts`, `transcribe`, `-live`, trailing `-image`, `veo`, and `lyria`.
- `conversationalRecords` drops only non-conversational records and keeps order and names of the rest.

`src/models/merge.test.ts` (extended):

- Claude and Codex outcomes carrying non-conversational ids alongside conversational ones add only the conversational ids; added counts and reached harnesses reflect that.
- An OpenCode outcome carrying ids such as `google/veo-3`, `google/gemini-embedding-001`, and `openai/gpt-4o-transcribe` alongside normal chat ids adds only the chat ids, keeps prefix grouping intact, and reports counts without the skipped ids.
- A non-conversational id already in the catalog for a reached harness is dropped on refresh.

`src/models/manager.test.ts` (extended):

- A refresh whose providers return a mix of conversational and non-conversational ids writes a catalog and override file that contain none of the non-conversational ids.

## Specs and docs

- `product/specs/models-tab.md` — state in the Refresh section that non-conversational ids reported by a provider are skipped and never added to the catalog.
- `help/models.md` and `documentation/user-documentation/tab-types/models.md` — reviewed; they describe pressing Refresh and the notification, not which ids may be added, so no statement in them becomes false. No change.

## Out of scope

- Provider fetchers, the manager's fetch/queue/lifecycle, the wire contract, and the Models UI. None change.
- Hand-edited override catalogs. A user can still hand-add any id; the rule constrains only what Refresh adds.
- The contents of the bundled `known-models.json`, which is already curated and already guarded.
