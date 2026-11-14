# Document the glob-paths refusal of a `.` or absolute-root `dir` in the remote-server spec

**Complexity: 1/10** — no production code changes, 2 requirements, 2 test scenarios (p=2.76)

The `Protocol version 42` paragraph of `product/specs/remote-server.md` says only a `dir` that climbs out of the root or passes through an outside link is refused as an error, and that every other `--path` failure is answered in the text. The far-side gate is stricter: `refusedPaths` in `src/remote/filesystem/refusal.ts` exempts only an empty `dir` for a `rootDestination` operation, relativizes an absolute `dir` against the root, and passes the result to `containedPath` in `src/path-containment.ts`, which returns nothing for `.` and for an empty relative path. So a `dir` of `.`, and an absolute `dir` naming the root itself (which relativizes to `''`), are refused with the "outside this file navigator" error. A sender built from the spec would send `.` for a typed `--path .` and fail on every remote glob of the root.

## Goal

The spec states the contract the gate ships: a `dir` of `.` or an absolute path naming the root is refused as an error, a sender names the root with an empty `dir`, and only the remaining `--path` failures are answered in the text. A test pins both refusals.

## Approach

Documentation correction plus tests. The behavior was decided in `product/plans/complete/file-glob-5-remote-glob-paths-operation.md` and stays as it is; neither the gate nor `src/remote/filesystem/glob-paths-operation.ts` changes.

## Implementation steps

1. In `product/specs/remote-server.md`, in the `Protocol version 42` paragraph, add to the containment sentences that a `dir` of `.` or an absolute path naming the root itself is also refused as an error, so a sender names the root with an empty `dir`; narrow "Every other `--path` failure" so it no longer covers those values; keep the sentence that an empty `dir` globs the root.

## Tests

In `src/remote/serve-file-navigator.test.ts`, beside `refuses a glob-paths dir that escapes the workspace as an error`:

- `request('glob-paths', { pattern: '*', dir: '.' })` replies with `{ error: expect.stringContaining('outside this file navigator') }` and no `result`.
- `request('glob-paths', { pattern: '*', dir: root })` (the absolute far-side root) replies with the same error and no `result`.

The existing glob-paths cases in that file and in `src/remote/filesystem/operations.test.ts` keep passing untouched.

## Out of scope

- Any change to `refusedPaths`, `containedPath`, or the `glob-paths` operation.
- The near-side sender (subplan 6) and the refusal-to-line mapping (subplan 7).
- Help pages and user documentation, which do not describe the wire contract.
