# Preserve file navigator copy destinations during overwrite

## Complexity

6/10. The change is localized to file-copy replacement and its focused tests, but correct rollback and failure reporting need careful ordering across filesystem operations.

## Goal

An overwrite copy leaves the existing destination recoverable until a complete replacement is ready to install. A failed copy or install leaves the previous destination intact whenever restoration succeeds.

## Approach

Copy into a unique sibling staging path, move any existing destination to a unique backup sibling, and install the completed stage by rename. Remove the backup only after installation succeeds. If installation fails, restore the backup and report its path if restoration also fails. Clean up incomplete staging entries without replacing the original operation error. Keep non-overwrite conflict behavior unchanged.

## Implementation steps

1. Add staged overwrite replacement to `copyItem` while retaining the existing non-overwrite path.
2. Add failure-injection tests for file and directory copy failures, install failure with successful restoration, and restoration failure.
3. Document the overwrite recovery guarantee in `product/specs/file-navigator-tab.md`.

## Tests

- Failed file and directory copies preserve the original destination and remove incomplete staging paths.
- Failed installation restores the original destination and reports the install error.
- Failed restoration reports the retained backup path and leaves that backup recoverable.
- Existing copy success, conflict, and overwrite tests continue to pass.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changes to paste conflict selection, move semantics, remote filesystem operations, or crash recovery of orphaned stage and backup entries.
