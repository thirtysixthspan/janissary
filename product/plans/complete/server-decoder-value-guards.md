# Server decoder value guards

## Goal

Have server decoders and named record helpers use `src/value-guards.ts` as the sole object guard while preserving every caller's existing narrowing.

## Scope

Replace the local guards in the listed server decoders, alias `isObject` to `isRecord`, delegate `asRecord` while keeping its signature, and pin `isRecord` behavior in a colocated test. Plugin `shared.ts` contracts are excluded because the binding plugin rule requires them to import nothing; their local guards remain independent.

## Verification

Run `./scripts/run.mjs check-diff` after implementation. No behavior or spec change is expected because the shared guard matches the local predicate. Completed by replacing each specified decoder guard, adding focused coverage, and removing this item from the ready backlog.
