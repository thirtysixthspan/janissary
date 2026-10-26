# Memoize successful runscript Git exclusions

**Complexity: 4/10** — one module-level set avoids repeating exclusion checks after they succeed, while failed checks remain retryable; existing call sites and Git safety checks stay intact.

## Goal

Reading and listing runscripts do not spawn repeated synchronous Git processes after their state and scripts paths have been safely excluded once.

## Approach

Track normalized project roots for which `ensureSystemScheduleExcluded` completed without throwing. Return immediately for cached roots, and add a root only after the full existing exclusion check and any required verification succeed. Leave failures uncached so tracked paths and unsafe exclusion files continue to be reported on every attempt. Export a reset for isolated tests. Switch the scripts-tab refresh from `listRunscriptNames` to `catalogRunscripts`, since both now share the same cached setup step.

## Implementation steps

1. Add the success cache, normalized-root key, and test reset to `local-exclude.ts`.
2. Have the scripts-tab row refresh use `catalogRunscripts` and update its rationale comment.
3. Test that a second successful read performs no additional Git setup and that a failed check is retried.
4. Remove this entry from the technical-debt backlog and promote the plan to complete.

## Tests

- `ensureSystemScheduleExcluded` tests pin cache hits, successful completion, and retry after failure.
- Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Changing the exclusion paths, safety checks, or stderr reporting.
- Rechecking tracked paths after an exclusion has already been verified during this process.
