# Limit role ACP sandbox reads to adapter dependencies

**Complexity: 4/10** — ~125 added lines across 3 production files, 4 requirements and 5 scenarios (p=5.06).

## Summary

Bundled Claude and Codex role adapters currently widen `SELF_DIR_R` to Janissary's entire `node_modules` directory. That exposes unrelated installed packages to role processes even though ordinary harnesses rely on the existing nearest-`node_modules` behavior.

## Goal

Let bundled Claude and Codex ACP role adapters read their executable and required runtime dependency closure inside a sandbox, while keeping unrelated sibling packages unreadable and preserving ordinary harness access and the server's Node runtime access.

## Approach

Resolve only known bundled adapter executables under Janissary's installation. Walk each adapter package's runtime dependencies and bind literal and real package paths as separate Seatbelt parameters. For those adapter launches, bind the executable paths directly instead of widening the ordinary self-executable carve-in to the enclosing `node_modules` tree. Keep the existing nearest-`node_modules` behavior for every other harness executable. Leave the server Node directory carve-in in place for adapter shebangs.

## Implementation steps

1. Add a focused resolver for bundled adapter package roots and their declared runtime dependency closure. Use its results in `src/sandbox/harness-spawn.ts`, extend `src/sandbox/install-reads.ts` and `src/sandbox/profile.ts` with indexed adapter package read params, and retain the old executable-directory resolution for non-role launches.
2. Add resolver coverage in `src/sandbox/harness-spawn.test.ts` for both bundled adapter closures, denial of unrelated packages, server Node access, and unchanged ordinary harness `node_modules` access. Add a live Seatbelt case in `src/sandbox/live.sandbox.test.ts` that loads a bundled adapter dependency and confirms an unrelated sibling adapter source file is denied.
3. Update `product/specs/sandbox.md` and `documentation/user-documentation/command-bar/tasks.md` to describe the new role-adapter boundary and the retained ordinary harness behavior.
4. Move the plan to complete and remove only the matching entry from `product/backlog/pull-request.md`, restoring the empty skeleton after the entry is removed.

## Tests

- Resolver tests assert Claude and Codex each receive their executable package and transitive runtime dependency paths, while an unrelated sibling adapter package is absent.
- A non-role executable in Janissary's `node_modules` keeps the existing nearest-tree carve-in.
- A live macOS Seatbelt test loads `zod` through the Claude adapter's module context and fails if the sibling Codex adapter's JavaScript file can be read.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step and before publication.

## Spec and documentation impact

- `product/specs/sandbox.md` will specify that bundled role sessions can read only the selected adapter package and its runtime dependency closure, while ordinary harness executables keep their existing `node_modules` carve-in and the server Node directory stays readable.
- `documentation/user-documentation/command-bar/tasks.md` will replace its full-dependency-directory claim with the scoped adapter dependency behavior.

## Out of scope

- Changing ordinary harness executable read behavior.
- Changing the server Node runtime carve-in, secret denies, write policy, or non-role ACP agent access.
- Updating the pull request description or any other backlog entry.
