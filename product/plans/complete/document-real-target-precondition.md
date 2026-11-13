# Document the real-path precondition on the physical containment check

**Complexity: 1/10** — ~8 added comment lines in 1 file, 2 requirements, 1 test scenario (p=3.38).

Source: PR #1996 branch backlog entry "Document the real-path precondition on the exported physical containment check so later writer callers cannot pass it an unresolved path and silently skip symlink containment."

`checkRealTarget(realRoot, realTarget)` in `src/file-read/policy.ts` compares two strings with `containedAbsolute`. It is correct only when both were already canonicalized through `realpathSync`; given the lexical join of a root and a path through a symlinked parent, it sees a contained string and returns `undefined` for a target that physically lives outside the root. Nothing at the call site says so. The reader in `src/file-read/read.ts` calls it correctly today, but the writer and editor in later subplans handle targets that do not exist yet and cannot realpath them directly, so the contract has to be visible where those callers read it.

## Goal

Make the precondition explicit at both exported path checks, and pin the hazard in a test, without changing any behavior.

## Approach

- Add a short comment above `checkRealTarget` stating that `realRoot` and `realTarget` must already be canonical paths from `realpathSync` (for a target that does not exist yet, the realpath of its nearest existing parent joined with the remaining segments), that it does no resolution of the target by design so it stays free of target I/O per the shared-file-policy subplan, and that an unresolved path skips symlink containment.
- Add a one-line comment above `checkLexicalPath` saying it is the pre-I/O check and does not replace `checkRealTarget`.
- Do not add `realpathSync` or any other I/O to `checkRealTarget`.

## Implementation steps

1. Add the two comments in `src/file-read/policy.ts`.
2. Add the test case in `src/file-read/policy.test.ts`.

## Tests

In `src/file-read/policy.test.ts`, under `describe('checkRealTarget')`:

- A directory symlink `root/link` pointing at the outside temp directory, with a file written under the outside directory: `checkRealTarget(root, realpathSync(path.join(root, 'link', 'a.txt')))` returns `'Outside the workspace'`.

`src/file-read/policy.test.ts` and `src/file-read/read.test.ts` otherwise stay green unchanged, and `readWorkspaceLines` behavior does not move.

## Specs and documentation

No change. `product/specs/acp.md` already states that a symbolic link resolving outside the root returns `Outside the workspace`, and this change alters no user-visible behavior.

## Out of scope

- Enforcing the precondition at runtime (a resolution call or assertion inside `checkRealTarget`).
- The writer and editor callers in later subplans.
