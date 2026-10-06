# Run search matching in a terminable worker

**Complexity: 8/10** — add the search plugin's first worker boundary, including source and compiled worker loading, request correlation, cancellation, deadline recovery, and scan integration.

## Goal

Keep a pathological regular expression from blocking the server event loop, while preserving search results, ordering, context, and the 250-row limit. A timed-out or cancelled worker must not prevent a later search from running.

## Approach

Create one worker for each active scan. Send plain query modes, text or lines, operation, and a monotonically increasing request id. Construct the matcher and run both file detection and row extraction inside that worker. The parent owns a named per-job deadline, rejects pending work and terminates the worker on expiry or cancellation, and ignores replies without a pending request. Resolve the worker entry as TypeScript under the source runner and JavaScript in compiled output.

Keep file listing, filtering, size checks, reads, scan ordering, row streaming, and the result cap in `scan.ts`. Surface worker deadline and runtime errors through the existing scan-error batch. Keep invalid-pattern feedback through the current session reporting path.

## Implementation steps

1. Add the worker protocol, worker entry, and adapter with request ids, parent-side deadlines, lifecycle handling, and source/compiled entry resolution.
2. Route detection and row extraction through the adapter in `scan.ts`, disposing it on completion, cancellation, and failure. Provide an injectable executor for scan unit tests.
3. Add deterministic adapter lifecycle tests for expiry, cancellation, and ignored late replies, plus a real worker test proving parent responsiveness during expensive matching and successful use by a subsequent search.
4. Update search specs with the matching deadline outcome and retain existing matching and scan coverage.

## Tests

- Preserve matching semantics, context, ordering, streaming, cancellation, and 250-row cap coverage.
- Verify pending jobs settle when a worker expires or is cancelled, late replies do not settle a newer job, and worker path resolution selects source and compiled entries correctly.
- Use a catastrophic regular expression in an isolated worker test; assert a parent timer runs before the worker deadline and a later query succeeds.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Spec and documentation

Update `product/specs/search-tab.md` to state that a matching job that exceeds its deadline ends the search with an error, and a later query can run normally. No existing user help or public documentation describes matching deadlines.

## Out of scope

- Changing regex syntax, whole-word behavior, result order, context, or result limits.
- Moving filesystem access or project file listing into the worker.
- Changing plugin API contracts or worker behavior for other plugins.
