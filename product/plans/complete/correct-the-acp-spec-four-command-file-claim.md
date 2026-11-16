# Correct the ACP spec's four-command claim about the file row

**Complexity: 1/10** — no production code; a one-sentence spec correction (p=1.58).

## Summary

The Web search section of `product/specs/acp.md` explains parent-row gating by analogy: "as disabling `file` disables its four commands." The native vocabulary has five file commands — `file read`, `file glob`, `file grep`, `file write`, and `file edit` — as `NATIVE_ACP_COMMANDS` in `src/plugins/roles/shared.ts` lists, and as `product/specs/application-commands.md` already states in its five-row `file` paragraph, which ends "disabling `file` disables all five." The stale count understates the parent row's blast radius and puts the two specs in conflict, so a reader deciding whether to disable `file` cannot tell which commands stop working.

## Design decisions

1. **Say "all five" rather than enumerate the names in this sentence.** The sentence is an analogy inside the Web search section; the authoritative enumeration already sits in `product/specs/application-commands.md`, which the entry names as the cross-check. Repeating the five names here would give the spec a second list to keep in step.

2. **Correct the count, not the gate rule.** `web search` keeps its own row, disabling the parent `web` row still disables it, and `file` gating is otherwise unchanged. Only the number is wrong.

3. **Leave historical plans alone.** `product/plans/complete/file-glob.md` says disabling `file` disables "all four file rows", which was true when that plan was written. It records an earlier state, and the entry explicitly excludes it.

4. **No help or user-documentation edit.** Neither `help/` nor `documentation/` carries a four-command or four-native file-row count; both describe the commands without a parent-row count. There is nothing to correct there.

## What already exists (reuse, don't rebuild)

| Need | Existing precedent | Location |
| --- | --- | --- |
| The five `file` rows and the parent-disable rule | the `file read` … `file edit` paragraph ending "disabling `file` disables all five" | `product/specs/application-commands.md` |
| The native command vocabulary | `NATIVE_ACP_COMMANDS` | `src/plugins/roles/shared.ts` |
| The claim to correct | the Web search section's parent-row sentence | `product/specs/acp.md` |

## Proposed changes

1. **`product/specs/acp.md`**, Web search section, final sentence: replace "as disabling `file` disables its four commands" with "as disabling `file` disables all five file commands." The rest of the paragraph is untouched.

## Tests

None. The change is prose with no assertion over it. Verification is the comparison against `NATIVE_ACP_COMMANDS` and the five-row paragraph in `product/specs/application-commands.md`, plus a search for other current four-command claims.

## Out of scope

- No code or test change.
- No change to `product/plans/complete/file-glob.md` or any other historical plan describing the four-row state.
- No help-page or user-documentation change, since neither carries the claim.
- No pull request description change; the entry does not ask for one.

## Verification

- `$janissary/scripts/run.mjs check-diff`.
- Search `product/specs/`, `help/`, and `documentation/` for "four commands" and "all four"; expect no current-vocabulary hit after the edit.
- Read the corrected sentence beside `NATIVE_ACP_COMMANDS` and the `file` paragraph in `product/specs/application-commands.md`.
