# Document ssh import and export in the product specs
**Complexity: 1/10** — spec-only: 0 production lines, 0 files, 0 requirements, 0 scenarios, 0 new units (p=1.58)

## Goal

Bring `product/specs/hosts-tab.md` and `product/specs/ssh-tab.md` in line with the behavior delivered by subplans 1 to 12: an "Importing and exporting" section, the two new command verbs and their usage lines, and the note that imported hosts drop other ssh settings. It is the thirteenth and last piece of `import-openssh-aliases-into-the-hosts-tab.md`, named by file name so the reference survives that plan's promotion, and changes no application behavior.

## Requirements

1. `product/specs/hosts-tab.md` gains an "Importing and exporting" section (source plan Implementation step 8).
2. That section describes the all-or-none Import and Export actions with no dialog ("the import is all or none, without dialog", "the export is all or none, without dialog").
3. That section states the exact successful and empty summary lines for both actions: `Imported 1 host from <path>.`, `Imported 3 hosts from <path>; skipped 2.`, `No aliases to import from <path>.`, `Exported 1 host to <path>.`, `Exported 5 hosts to <path>; skipped 1.`, and `No hosts to export.` ("One summary line", "Cannot read / Nothing to").
4. That section states the managed-section boundaries `# BEGIN janissary hosts` and `# END janissary hosts`, the header comment `# Managed by Janissary; edits inside this section are replaced on export.`, and the block format of `Host <name>` then four-space-indented `HostName`, `User` and `Port` lines with one blank line between hosts ("Managed section", "Plus a header comment").
5. That section states that a missing target is created with mode `0600` and a missing parent with mode `0700` ("Create it").
6. That section states the exact refusal lines: `hosts import and hosts export work only in local tabs.`, `Cannot read ssh config <path>: <problem>.`, `Could not write ssh config <path>: <problem>.`, and `Cannot export hosts: <path> is unusable — fix it by hand.` alongside the `Hosts file <path> is unusable: <problem>.` notice ("Refuse in remote tabs", "Cannot read / Nothing to", "Could not write …", "Refuse, mirror wording").
7. The `hosts` Commands section in `product/specs/hosts-tab.md` gains `hosts import [file]` and `hosts export [file]`: both default to `~/.ssh/config`; a `~`, `~/`, `$HOME/`, `$root` or `$workspace` prefix expands to the home directory, the project root, or `$root/.janissary/workspace`; a relative operand is tried against the typing tab's working directory and then the project root; and a double-quoted operand keeps its spaces ("`hosts import <file>` command to allow for other files", "Button + `hosts export`").
8. The Commands section gains the new bare usage line `Usage: hosts [list|add|remove|import|export].` and the two verb-specific usage lines ("Extend + own lines").
9. The Commands section states that both new verbs match regardless of case ("Every verb matches regardless of case").
10. `product/specs/ssh-tab.md` § Saved host destinations notes that a host imported from ssh config carries only its destination, user, and port, and that other ssh settings such as `IdentityFile` and `ProxyJump` stop applying ("HostName, user, port").
11. The new text states error and usage messages verbatim rather than paraphrasing them (developer-documentation guidelines, "State the exact error and usage messages").

## Design decisions

Depends on subplans 1 through 12 being implemented, not merely promoted — in particular the command path in `import-openssh-aliases-into-the-hosts-tab-10-command-runtime.md` and the buttons in `import-openssh-aliases-into-the-hosts-tab-12-client-buttons.md` — since the spec must describe the shipped behavior. It lands last; nothing depends on it.

- Specs are authoritative in this project, so the behavior change is not complete until both affected spec files describe it (Assumption 1). This subplan writes only specs; it does not open a PR and does not add a documentation page under `documentation/`.
- The new hosts-tab section sits beside the existing "Commands" and "Editing hosts" sections and follows the house style: behavior, exact messages, edge cases, and a brief inline why at surprising decisions (Assumption 2). Cross-references use `[[ssh-tab]]` where the two specs meet.
- The verb entries go into the existing Commands section rather than a separate command file, so the grammar and all usage lines stay in one place. The bare usage line in that section is replaced, not supplemented.
- The ssh-tab change is one paragraph in "Saved host destinations", next to the existing explanation that a saved host launches with a port and `user@host` only. No new section is added there.

## Preserved behavior

None found. This subplan edits specs only and adds no application behavior, so no existing test is affected.

## Assumptions

1. Specs are the source of truth and a behavior change updates its spec in the same change: `ai/guidelines/architecture-principles.md:77` `A behavior change updates its \`product/specs/\` file in the same change;`.
2. Specs state exact messages and cover edge cases as a first-class part of the text: `ai/guidelines/developer-documentation.md:23` `State the exact error and usage messages`, verbatim, not paraphrased, and `:26` `Cover edge cases as a first-class section`.
3. The current hosts command grammar and usage lines live in one section: `product/specs/hosts-tab.md:62` `### Commands`.
4. The saved-host destination text that must gain the imported-host note lives at `product/specs/ssh-tab.md:45` `### Saved host destinations`.

## Existing functionality

1. The current catalog and Hosts tab behavior spec: `product/specs/hosts-tab.md:40` `### The Hosts tab`.
2. The current command grammar and usage lines: `product/specs/hosts-tab.md:62` `### Commands`.
3. The saved-host launch description: `product/specs/ssh-tab.md:45` `### Saved host destinations`.

## Implementation steps

Every step ends green under `$janissary/scripts/run.mjs check-diff`. This subplan changes two spec files only, so the whole tree compiles at this commit with no code change and no dangling reference.

1. In `product/specs/hosts-tab.md`, add an "Importing and exporting" section covering Requirements 2 to 6, and extend the Commands section with the two verbs, their default path, operand rules, case-insensitive matching, and the three usage lines (Requirements 1 and 7 to 9). Replace the old bare usage line rather than adding a second one. State every message verbatim. Build with `$janissary/scripts/run.mjs check-diff`.
2. In `product/specs/ssh-tab.md`, add the imported-host note in "Saved host destinations" next to the existing port-and-`user@host` paragraph (Requirement 10). Keep the note to one paragraph and link to `[[hosts-tab]]`. Build with `$janissary/scripts/run.mjs check-diff`.
3. Read both diffs once to confirm no verbatim message drifted and no other section changed. Build with `$janissary/scripts/run.mjs check-diff` and confirm the diff contains only these two spec files.

## UI design

1. No user interface surface changes. This subplan edits spec text only; the buttons are specified in `import-openssh-aliases-into-the-hosts-tab-12-client-buttons.md`.

## Tests

This subplan changes no application behavior and introduces no code, so it adds no tests. The behavior it documents is pinned by the colocated tests that `import-openssh-aliases-into-the-hosts-tab-1-ssh-config-tokenizer.md` through `import-openssh-aliases-into-the-hosts-tab-12-client-buttons.md` add; those tests must be green once those subplans are implemented and before this spec-only subplan lands. Verify the spec text by reading it, as described under Verification.

## Out of scope

- No source, test, config, or schema change.
- No documentation page outside the two spec files named above.
- No change to any other spec file, plan, or status folder.

## Verification

Run `$janissary/scripts/run.mjs check-diff`; lint, typecheck, and both test projects must pass with only these two spec files changed.

Then read `product/specs/hosts-tab.md` from its Commands section through the end of "Importing and exporting" and read `product/specs/ssh-tab.md` § "Saved host destinations". Confirm the bare usage line reads `Usage: hosts [list|add|remove|import|export].`, that both verb usage lines and the operand rules from Requirement 7 appear, that the managed-section markers, header comment and block format from Requirement 4 appear, that each summary and refusal message from Requirements 3 and 6 is written verbatim, and that the ssh-tab paragraph says other ssh settings stop applying for an imported host. A failure looks like a paraphrased message, the old bare usage line, a missing managed-section detail, or a missing note in ssh-tab.
