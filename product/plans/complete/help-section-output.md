# `help <section>` prints only that section

**Complexity: 3/10** — one pure module that splits `help.md` into named sections and picks one, wired into the single place `help` is answered. No wire, client, or registry change.

The backlog asks that "the command `help <section>` should only output the relevant section from the help documentation." Today only a bare `help` is recognized: `getOutput` in `src/commands.ts` answers `help` and nothing else, so `help shell` falls through to the unknown-command path. In an agent tab that means the route chooser; in a shell tab the line is not claimed and goes to zsh, which runs the shell's own `help` builtin.

`help.md` already has a section structure a reader can name. It has two `###` headings, **Commands** and **Key Bindings**, and Key Bindings is itself split into bold-labelled blocks, each a one-line label followed by a table: **Global key bindings**, **Command bar and agent tab controls**, **Shell tab controls**, **Image tab controls**, **Markdown tab controls**, **Audio tab controls**, **Asciicast tab controls**, **Editor tab controls**, and **File navigator controls**.

## Goal

`help <section>` prints just the named part of the help text: `help commands` the command table, `help key bindings` every key-binding table, `help shell` the shell tab's key table. Bare `help` is unchanged, and a name that matches nothing says so and lists the names that would.

## Approach

**Sections come from the document, not from a list in code.** A pure function reads the help markdown and returns its sections in document order: each `###` heading with everything up to the next `###` heading, and each bold-labelled block inside one with its label line and the table directly under it. Adding a tab-controls block to `help.md` therefore makes `help <that tab>` work with no code change.

**Matching is forgiving but deterministic.** The query is lowercased with runs of whitespace collapsed. Section titles are compared the same way, a bold block's title being its bold text (`Shell tab controls`). The first rule that finds anything wins, and within a rule the first section in document order wins:

1. the title equals the query (`help commands`, `help key bindings`);
2. the title starts with the query (`help shell` → Shell tab controls, `help key` → Key Bindings, `help file` → File navigator controls, `help command` → Commands, the earliest title it starts);
3. the query appears in the title as whole words (`help agent` → Command bar and agent tab controls, `help navigator` → File navigator controls).

**An unmatched name is answered, not routed.** `help <nothing that matches>` replies `No help section matches "<query>". Sections: <titles, comma-separated>.` as ordinary help output. It is still a `help` command, so it neither opens the route chooser in an agent tab nor reaches zsh from a shell tab.

**One answer path.** `getOutput` stays the only place `help` is answered, and both the interactive dispatcher and the capture path already render its `output` as markdown. The capture path decided its markdown flag by comparing the text to the literal `help`, which would leave `help shell` sent from another agent as plain text; since `output` only ever comes from `help`, that path marks every `output` reply as markdown.

**Fallback text is unchanged.** If `help.md` cannot be read, `help <section>` returns the same generated one-line summary bare `help` does: there are no sections to choose from.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The one place `help` is answered, and the cached `help.md` read | `src/commands.ts` (`getOutput`, `buildHelp`) |
| Markdown rendering of an `output` resolution in a tab | `src/command/manager.ts` |
| The capture path's `help` answer for agent messages | `src/capture/router.ts` |
| Existing `help` tests to extend | `src/commands.test.ts`, `src/capture/router.test.ts` |

## Implementation steps

1. **Add `src/help-sections.ts`**, a pure module: `parseHelpSections(markdown)` returning `{ title, text }[]` in document order, and `selectHelpSection(markdown, query)` returning the matching section's text or the no-match message.
2. **Route `help <query>` through it in `src/commands.ts`.** `getOutput` recognizes a first word of exactly `help` followed by a query, split on whitespace rather than matched with a regular expression (the security lint rejects the optional-group pattern); with a readable `help.md` it returns the selected section, otherwise the fallback summary. Bare `help` returns the whole text as before.
3. **Mark every capture-path `output` reply as markdown** in `src/capture/router.ts`.
4. **Update `help.md`'s `help` row**, the `help` section of `product/specs/application-commands.md`, and the `help` entry in `documentation/user-documentation/command-bar/commands.md`.

## Tests

In a new `src/help-sections.test.ts`, against a small fixture shaped like `help.md`:

- The parser returns the `###` sections and the bold-labelled blocks in document order, with their titles.
- A bold block's text is its label line and its table, and stops before a following paragraph or the next block.
- An exact title match wins over a prefix match (`commands` picks Commands, not Command bar and agent tab controls).
- A leading prefix selects a section (`shell` → Shell tab controls; `key` → Key Bindings).
- A whole-word match anywhere in a title selects a section (`agent` → Command bar and agent tab controls).
- Matching ignores case and extra whitespace (`  KEY   bindings `).
- An unmatched query returns the no-match message naming every section title.

In `src/commands.test.ts`, against the real `help.md`:

- `help shell` is classified as output, contains the shell tab key table, and contains none of the command table.
- `help commands` contains the command table and none of the key-binding tables.
- `help nosuchsection` is output (not unknown) carrying the no-match message.
- `helper` is still an unknown command.

In `src/capture/router.test.ts`:

- `help shell` answered through the capture path is appended to the transcript as markdown.

## Out of scope

- **Help for a single command** (`help zsh` printing only the `zsh` row). A natural next step, but the issue asks for sections.
- **Tab completion of section names** after `help `.
- **Restructuring `help.md`** or sorting its rows; sorting is a separate backlog item.
