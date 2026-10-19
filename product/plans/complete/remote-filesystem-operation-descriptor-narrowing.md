# Give remote filesystem operations a shared descriptor constraint and checked decoders

**Complexity: 6/10** — this is one focused server feature across its descriptor type, the filesystem operation table, the existing argument predicates, and the colocated table tests. `operations.ts` is over 200 physical lines but remains within the configured nonblank, noncomment line count, so no extraction is needed. The two increments share this source surface, but are independently checked as the backlog proposal requests.

## Goal

Give the three remote filesystem operation tables one named descriptor constraint, keep the constraint as permissive as necessary, and have each decoder produce its values through checked narrowing rather than assertions.

## Design decisions

Declare and export `AnyOperationDescriptor` next to `OperationDescriptor`. First try `OperationDescriptor<unknown>`; retain `any` and one localized lint suppression only if the diff typecheck proves unknown incompatible with the tables' variance.

Add type-predicate argument guards where a decoder needs a narrowed value. Validators must establish the same conditions their decoders rely on. Preserve accepted and rejected wire shapes and leave `descriptorFor` behavior unchanged.

Keep result decoding behavior unchanged. `operations.ts` satisfies the configured file-size rule when comments and blank lines are excluded, so avoid an unrelated extraction.

## Implementation steps

1. Add the named alias and point all three `satisfies` constraints to it. Run the existing operation tests and `./scripts/run.mjs check-diff`; retain the localized suppression only if unknown does not typecheck.
2. Replace argument decoder assertions in the filesystem operations, including the standalone write-file descriptor, with checked narrowing. Extend guards only where needed and add or adjust tests that prove malformed values are rejected before decoding. Run the operation tests and `./scripts/run.mjs check-diff`.
3. Remove only this debt entry from the ready section and move this plan from draft through ready to complete.

## Specs and documentation

No spec or user documentation change is needed. The accepted wire arguments, validation outcomes, and filesystem behavior remain unchanged; this is an internal type-safety improvement.

## Out of scope

- Changing `descriptorFor` behavior.
- Changing operation names, accepted wire shapes, or filesystem effects.
- Resolving any other technical-debt item or altering unrelated working-tree changes.
