# Report a failed OAuth staging cleanup instead of leaving a second plaintext credential

**Complexity: 2/10** — one production file, a handful of added lines, two behavioral requirements and three test scenarios, with no new modules (p=3.58).

## Goal

When Janissary seeds a workspace-private OpenCode OAuth copy, it writes the credential to a `0o600` staging file, hard-links that file to `auth.json`, then unlinks the staging file. If the final unlink fails, `writeOauth` currently swallows the error and returns success, so `prepareOpencodeData` reports the credential as available while a second plaintext copy of the OAuth token (`.auth-seed`) is left behind in the sandbox data home. That stale copy outlives the linked auth file and is invisible to the caller that was told preparation succeeded. A failure to remove the staging file must instead fail the whole preparation and leave no copy of the credential on disk.

## Approach

1. In `src/sandbox/opencode-data.ts`, stop swallowing a staging-unlink failure in `writeOauth`: replace the silent `catch { return; }` with a catch that removes the hard-linked `auth.json` (using `rmSync`, which is not the call that just failed) and rethrows the original error.
2. Let the error propagate to `prepareOpencodeDataHome`, whose existing catch already removes the whole data home on any `writeOauth` failure, and then to `prepareOpencodeData`, which already maps such storage errors to `{ type: 'failed', reason: 'storage' }`. No change is needed to either caller.
3. Add a failure-path test that makes `unlinkSync` throw and asserts both a storage-failure result and that no credential file remains, including the staging file and the linked `auth.json`.

## What already exists (reuse, don't rebuild)

| Existing piece | File | Relevance |
| --- | --- | --- |
| `writeOauth` seeding routine | `src/sandbox/opencode-data.ts` | The silent `catch { return; }` around the final `unlinkSync(staging)` is the only production change. |
| `prepareOpencodeDataHome` catch | `src/sandbox/opencode-data.ts` | Already `rmSync`s the whole data home when `writeOauth` throws, so a rethrown error cleans up the staging file too. |
| `prepareOpencodeData` storage mapping | `src/sandbox/opencode-data.ts` | Already maps a thrown storage error to `{ type: 'failed', reason: 'storage' }`; no change. |
| Failure-path suite | `src/sandbox/opencode-data-failures.test.ts` | Mocks `node:fs` and already forces partial-write failures; extended with a forced unlink failure. |
| Success-path suite | `src/sandbox/opencode-data.test.ts` | Pins the seeded auth file and its mode; stays as the regression net for successful seeding. |

## Implementation steps

1. `src/sandbox/opencode-data.ts` `writeOauth`: change the final staging cleanup from `try { unlinkSync(staging); } catch { return; }` to a catch that calls `rmSync(authFile(dataHome), { force: true })` (removing the hard link left by `linkSync`) and rethrows the caught error, so a cleanup failure surfaces and no duplicate credential survives.

## Tests

- `src/sandbox/opencode-data-failures.test.ts`:
  - add `unlinkSync` to the `node:fs` mock so a test can force it to throw;
  - add a case where `unlinkSync` throws during seeding that asserts `prepareOpencodeData(scratch)` returns `{ type: 'failed', reason: 'storage' }` and that neither `opencode/auth.json` nor `opencode/.auth-seed` remains;
  - existing cases (partial write, directory creation failure, successful re-preparation, launch behavior after staging failure) must keep passing unchanged.
- Existing suite `src/sandbox/opencode-data.test.ts` must keep passing unchanged as the regression net for successful seeding and file modes.

## Spec

- `product/specs/sandbox.md`: in the filesystem-policy section covering the ChatGPT OAuth bridge, note that a failure to remove the temporary staging file fails the preparation and discards the linked copy so no duplicate plaintext credential is left behind.

## Out of scope

- No change to the staging file's mode, location, or naming.
- No change to the success path, credential content, or file modes.
- No change to the `OpencodePreparation` result type or the failure-notice text.
- No change to `env` scrubbing, sandbox profile rules, or any other spec concept.

## Verification

- Run `$janissary/scripts/run.mjs check-diff` after the source change and again after adding tests; both must be clean.
- Confirm no edited file exceeds the 200-line `max-lines` limit.
