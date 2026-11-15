# Validate and decode grep remote arguments
**Complexity: 5/10** — ~60 added production lines, 0 existing production files edited, 7 requirements, 48 test scenarios and 5 new units (p=5.41230).

## Dependencies

Depends on: `product/plans/ready/file-grep-1-command.md`. Source: `product/plans/complete/file-grep.md`.

## Goal and decisions

Add pure `src/remote/filesystem/grep-files-arguments.ts` so grep's wire-field validation can land and be tested before registering the operation. The remote protocol decision at `product/plans/complete/file-grep.md:106`, `grep-files`, defines the wire fields. Plan 1 defines `FileGrepArgs` in `src/file-grep/command.ts`; that module is a prerequisite, not existing implementation in this checkout.

Plan 11 consumes the two exports below directly in its descriptor. This slice has no operation-table or frame-decoder caller yet, and must typecheck without a `grep-files` member in the protocol union. Do not import a future protocol-map entry or add registration early.

## What already exists (reuse, don't rebuild)

| Existing piece | Verified location | Reuse |
| --- | --- | --- |
| Primitive checks and decoder error | `src/remote/filesystem/argument-checks.ts:12`, `stringValue`; `:20`, `requireString`; `:30`, `requireBoolean` | Reuse the string predicate and throwing string/boolean checks; false is a valid boolean. |
| Bounded numeric checks | `src/remote/filesystem/glob-paths-operation.ts:10`, `globLimit` and `requireLimit`; `src/remote/filesystem/read-lines-operation.ts:9`, `lineOffset` | Follow the number-type, safe-integer and inclusive-bound pattern, without glob/read's optional limit. |
| Required search switches | `src/remote/filesystem/search-text-operation.ts:6`, `searchTextOperation` | Follow strict required string/boolean validation rather than glob's optional switches. |
| Existing ceiling | `src/search/types.ts:4`, `SEARCH_MAX_RESULTS` | Import the existing 250 cap; do not create another maximum. |
| Descriptor contract | `src/remote/filesystem/operation-types.ts:15`, `OperationDescriptor`; `:29`, `descriptorFor` | Its validator takes a string-keyed unknown-value record and returns boolean; decoding returns typed arguments. |
| Record boundary | `src/remote/frame/decode-filesystem.ts:7`, `decodeRequest` | Existing ingress checks `isRecord` before the descriptor and validates before decoding. Neither export needs a second frame/object-shape layer. |
| Decoder conventions | `src/remote/filesystem/operations.test.ts:203`, `decodes %s to the keys it carries and no others`; `:209`, `drops any key the operation does not carry` | Explicitly select documented fields and reject invalid direct decoder calls. The present undefined path is the deliberate adaptation to plan 1's command contract. |

## Proposed changes

- Export `validFileGrepArgs`, taking `args`, a `Record<string, unknown>` argument record, and returning boolean without throwing for invalid field values. Require `pattern`, `include` and `exclude` to be strings. Empty strings are accepted here; command syntax and matcher semantics belong to their existing owners.
- Require `literal`, `word` and `caseSensitive` to be booleans, including explicit false values. Missing or undefined required fields are invalid. Do not default or coerce any required field, including include/exclude and limit.
- Accept absent or undefined `path`, or any string path including empty string. Do not normalize, trim, resolve or enforce containment here. `src/file-navigator/remote/port-reads.ts:31`, `remoteGlobPaths`, documents the existing path mapper's empty-string root spelling; grep's later port follows it.
- Require a numeric safe integer limit from 1 through `SEARCH_MAX_RESULTS`, inclusive. Follow the private `globLimit`/`requireLimit` split with local `grepLimit` and `requireLimit` helpers. Reject wrong types, fractions, nonfinite numbers and values outside 1–250. This is a numeric wire field, not the command parser's digit-string grammar.
- Export `decodeFileGrepArgs`, taking `args`, a `Record<string, unknown>` argument record, and returning `FileGrepArgs`, imported type-only directly from `../../file-grep/command.js`. It must independently enforce the same field contract even when called without the validator and throw exactly `Invalid remote filesystem operation arguments.` for invalid fields. Reuse `requireString`, `requireBoolean` and the local bounded limit helper; do not expose another error format.
- Return a fresh object containing exactly pattern, literal, word, caseSensitive, path, include, exclude and limit. Materialize an own `path` property with value undefined when absent or undefined on input, because plan 1 makes that property required with a string-or-undefined value. Drop unknown fields and leave the input record unchanged. Do not spread the incoming record or declare a second argument type.
- Preserve all accepted values verbatim, including whitespace, false switches, empty strings and malformed regex text. Both exports are pure: no command parsing, defaults, quote removal, regex/glob compilation, path mapping, I/O or matching. Semantic pattern diagnostics remain in the workspace entry.

Keep these exports independent of the protocol union, registry and descriptor module. Plan 11 assigns `validFileGrepArgs` and `decodeFileGrepArgs` directly to its descriptor's valid/decode callbacks. `descriptorFor` fixes its callback argument type to the protocol map even when the decoder returns a more specific object: plan 11's wire `path` remains optional, so its run callback must explicitly construct the `FileGrepArgs` boundary value with a present path property before calling `grepWorkspace`. Do not assume the decoder's return annotation narrows that callback or weaken plan 1's required property.

## Tests

Add colocated Vitest tests in `src/remote/filesystem/grep-files-arguments.test.ts`, importing both exports from `./grep-files-arguments.js`. Test the same records through the validator and direct decoder: accepted records return true and exact decoded fields; rejected records return false and throw the exact established error. Count the following 48 input scenarios, retaining table variants as distinct cases:

- Six valid records: absent path with all false switches and limit 1; explicit undefined path; empty path; ordinary path with mixed switches and limit 250; all true switches; and empty pattern/include/exclude strings. Assert an own path property for the absent and undefined cases, and retention of false and true values.
- Fourteen required-field cases: omit each of the seven required fields, then provide each explicitly as undefined. Path is excluded from this table.
- Seven wrong-type cases: numeric pattern, null include, array exclude, string literal, numeric word, object caseSensitive, and string limit. Assert strict types without string/number coercion.
- Five malformed path cases: null, number, boolean, array and object.
- Twelve invalid numeric-limit/value cases: 0, -1, 251, a fraction, NaN, positive infinity, negative infinity, null, boolean, array, object and an unsafe integer. Missing/undefined/string limit and both valid endpoints are covered above. NaN/infinities are direct-call cases even though JSON cannot transmit them.
- Three preservation cases: whitespace and backslashes across string fields; malformed regex text; and command-looking pattern text containing flags. Assert no trimming, parsing or semantic rejection.
- One unknown-field case: accept an extra field, strip it from decoded output and verify the original record is unchanged. Check exact keys with strict equality/own-property assertions so omitted path and present undefined cannot accidentally compare as equivalent.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Confirm the new colocated suite runs; if related-test selection omits it, run `npm run test:server -- src/remote/filesystem/grep-files-arguments.test.ts`.

For a manual module-level check after plan 1 lands, pass pattern `TODO`, literal/word/caseSensitive false, empty include/exclude and limit 100 to both exports, first omitting path and then supplying empty path. Expect true and the exact eight-field object with undefined or empty path respectively. Change limit to string `100` or remove literal: expect false and the established decoder error. The operation and application end-to-end request become available in later plans; do not register them to perform this check.

## Out of scope

No registered operation, protocol-map/union/version changes, result decoding, frame/operation test edits, port/workspace changes, defaults on the wire, regex execution or containment policy. This foundation exposes no public command; help/spec integration remains with the behavior-exposing plans and plan 17.

## Implementation constraints

Production scope is one new argument module, plus its colocated test; no existing production file grows. Keep the module below 200 lint-counted lines and use direct `.js` imports, type-only imports where required and no re-export barrel. Follow the type-aware rules in `eslint.config.mjs` without unsafe casts. Extract cohesive logic rather than compacting if needed. No `npm run check`; use the diff-scoped development gate.
