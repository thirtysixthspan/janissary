# Document file-navigator view restoration and completion

**Complexity: 2/10** — this is a documentation-only repair to two existing user references; the behavior and its functional specs are already implemented.

## Goal

Complete the user-facing documentation for restoring a file navigator's local view from the command line and for completing `files` clauses and their paths.

## Approach

Update the existing file-navigator guide and key reference in place. Keep their examples aligned with the implemented command grammar and the behavior described in the file-navigator, profiles, and tab-completion specs. Make clear that command restores update only named view parts on an existing tree, remote view clauses are ignored, and `files print` emits a reusable command.

## Implementation steps

1. In `documentation/user-documentation/tab-types/file-navigator.md`, add command examples beside the row-detail examples, including quoted paths and a representative `files print` result. Clarify near the profile restore explanation that command restores are local-only, affect only named parts, and are ignored for remote trees.
2. In `help/keys.md`, expand the command-bar Tab entry and its explanation to cover `files` clause words, tab labels, detail modes, sides, path completion, quoting, and path completion against a local `in <tab>` target. Include concise examples and the same restore and print behavior so both references describe the feature consistently.
3. Check the wording against the existing implementation and functional specs, run the diff-scoped checks and build the user documentation site.

## Tests and verification

No runtime behavior changes, so no new automated tests are needed. Run `$janissary/scripts/run.mjs check-diff` after each documentation step and `npm run docs:build`. Review the final diff to confirm examples use valid clause order, quote paths with spaces, and keep the tree root as the final argument in printed commands.

## Specs

The existing file-navigator, profiles, and tab-completion specs already describe the implemented behavior. No spec change is needed for this documentation-only repair.

## Out of scope

- Changing file-navigator parsing, completion, profile restore, or command output.
- Changing the already-updated command-bar tab-completion user guide or adding a new documentation page.
- Expanding the command reference or changing any other help page.
