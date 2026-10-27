# Open file navigators from parsed arguments

**Complexity: 4/10** — A focused server API change across the existing parser, navigator manager, command, and profile launcher, with colocated tests and a profile-spec correction.

## Goal

Pass structured file-navigator arguments from both command and profile launch directly to the manager, so the command grammar is parsed only once and a profile path is never mistaken for a command clause.

## Approach

Keep `parseFileNavigatorArgs` as the sole parser for user-typed `files` commands. The command handles `print` and parser errors, and passes an open result plus an output callback to `FileNavigatorManager.open`. Profile launch builds the same `FileNavigatorOpenArgs` shape directly from its validated entry. Move print-target lookup into the command so the manager no longer imports the commands layer; pass the resolved tab to the manager's print formatter.

This retains the current user-typed grammar and its error messages. It also removes profile-side quoting and the duplicated keyword set, rather than expanding the parser to support another input path.

## Implementation steps

1. Migrate the manager API and both callers together: make `FileNavigatorManager.open` accept `FileNavigatorOpenArgs` and an output callback, make `printView` accept a resolved tab, update `src/commands/files.ts` to parse once and resolve print targets, and have `src/profile/files.ts` pass structured arguments while collecting errors in the launch notes. Remove the profile-side `filesCommand`, `profilePath`, `profileLabel`, and `FILES_KEYWORDS` helpers.
2. Update the command, profile, and manager tests for the structured API; include a profile path equal to a clause word and preserve coverage for existing typed-command grammar and print errors. Update any remaining direct manager test callers to provide parsed arguments.
3. Update `product/specs/profiles.md` to describe clause-keyword paths as literal paths during profile launch and remove obsolete quoting/reparse limitations.

## Tests

- `src/commands/files.test.ts`: confirm open receives the parsed open value, parser errors do not open a tree, print resolves the requested tab before formatting, and manager output is attached through the command output callback.
- `src/profile/files.test.ts`: confirm profile entries produce structured arguments directly, including a path such as `print` or `expand`, and preserve dock, source-label, details, and view restoration behavior.
- `src/file-navigator/manager.test.ts` and `src/file-navigator/pull-refresh.test.ts`: exercise the manager with parsed arguments and retain open, root, view, and remote-refresh coverage.
- `src/file-navigator/args.test.ts`: retain coverage of the user-typed grammar, including clause-word paths and `print` as a path when it is not a print request.
- Run `$janissary/scripts/run.mjs check-diff` after each change and confirm the scoped lint, typecheck, and server tests pass.

## Specification and documentation

Update `product/specs/profiles.md` for the now-reliable literal path behavior. Check `help/commands.md`, `help/files.md`, `help/profile.md`, and the user-facing file-navigator and profile pages; update them only if they describe behavior changed here.

## Out of scope

- Changes to the user-typed `files` grammar, its parser, or its path-expansion rules.
- Changes to any other technical-debt item.
- Broader file-navigator architecture changes or profile schema changes.
