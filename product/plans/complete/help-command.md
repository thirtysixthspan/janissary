# `help <command>` should offer specific help on how to use a command including high level descriptions, command signature, use cases and examine commands

**Complexity: 4/10** — the code is small (two plain functions, one completer, one docs route), but about 52 pages have to be written and the change reaches many files: three specs, three docs pages, a guideline, eleven playbooks, packaging, and a sandbox test.

## Summary

Feature request (verbatim from `product/backlog/features.md`): "`help <command>` should offer specific help on how to use a command including high level descriptions, command signature, use cases and examine commands. These explanations should be stored as markdown files <command>.md in a /help directory. move command section in help.md to help/commands.md and Key Bindings section to help/keys.md. `help` alone should execute `help commands`."

The built help interface has three parts: bare `help` (also `help commands`) prints the command table, `help <name>` prints one detailed page, and `help keys` prints the key-binding reference. There is a page for every command-table entry, including `help` and the multiword `tab focus` command. Each page follows one layout: a `### <command>` heading and description, then **Usage**, **Use cases**, and **Examples**. Tab completes page names after `help`.

The pages live in `help/` at the installation root. In-app reads and completion use that directory directly; help replies are not cached. Requests require a readable `commands.md` index, accept only listed regular Markdown files inside the directory, and reject symlinks. Unreadable help returns the generated command summary. The docs site builds command pages from the same source in a collapsed **Command Reference** group, with escaped code-formatted headings and sidebar labels, preserved route names, and one build-generated sprite per page.

## Design decisions

These decisions describe the completed behavior and its boundaries.

### Pages and where they live

1. **`help <command>` prints a detailed command page.** Each page gives a high-level description, supported usage signatures, use cases, and examples. The help text was checked against the owning command parser or behavior spec; corrections include the `sqlite` token for `db`, the full browser forms, the required harness launch name and supported flags, the accepted `open` modifiers, the complete schedule forms, file-navigator targeting and display modes, and SSH options before the destination with an optional remote command after it.
2. **Pages are Markdown files named `<command>.md` in the installation-root `help/` directory.** `src/commands.ts` resolves the directory relative to the installed source or `dist/` location. `package.json` includes the directory in the published package.
3. **The old quick-reference file is split into `help/commands.md` and `help/keys.md`.** The command table and its `in group <name|id>` paragraph are in `commands.md`. The key tables are in `keys.md`; its final Tab-completion paragraph also describes the new `help` completion behavior. The old root `help.md` is deleted.
4. **Every command-table entry has exactly one detailed page.** A command's page name is its first word, so `tab focus <name>` uses `help/tab.md` and `newfile <file>` uses `help/newfile.md`. `src/commands.test.ts` compares the command table with the page directory in both directions, excluding the two reference pages `commands.md` and `keys.md`.
5. **Every command page uses one fixed layout.** It begins with `### <command>` and one description paragraph. **Usage** lists signatures, **Use cases** lists situations to use the command, and **Examples** gives commands with their results, in that order. The layout is reviewed rather than snapshot-tested.
6. **Help pages contain no links.** They name another command in plain text when needed, so the same content remains useful in-app and on the docs site.

### How `help` chooses what to print

7. **Bare `help` and `help commands` print the same command table.** Bare help no longer includes key-binding tables.
8. **A named request selects one exact page.** `help shell` now shows the shell command page, not the shell-tab key table. Old section lookup is removed: `help editor`, `help shell tab`, `help key bindings`, and `help tab focus` have no matching page. Key tables are available through `help keys`.
9. **One leading slash is ignored in a page name.** `help /quit` prints `quit`; `help //quit` looks up `/quit` and returns the missing-page response. A slash before `help` is stripped earlier by command resolution.
10. **Only listed, safe pages can be read.** A name must exactly match a `.md` filename in the directory listing after query normalization; it is never joined to an unchecked path. The candidate must be a regular file whose resolved path stays inside the canonical help directory. Symlinks are omitted from completion and docs generation and are unreadable through the runtime reader. The `commands.md` index must itself be listed and readable before any named page is returned.

### Replies and wording

11. **A missing page gets one exact reply.** `No help for "<name>". Type "help" for available commands.` The displayed name is lowercased, whitespace-collapsed, trimmed, and has one leading slash removed. Thus `help /nosuch` names `nosuch`, while `help //quit` names `/quit`. The reply is ordinary help output, not an unknown-command result.
12. **`help/commands.md` contains the command table and group paragraph only.** It has no pointer line to other help pages.
13. **The `help` row describes all three forms.** It says that bare `help` lists commands, `help <command>` shows one command's usage, use cases, and examples, and `help keys` lists key bindings. The command table remains alphabetized and each description remains at most 200 characters.

### Tab completion

14. **Tab completes the first argument after `help` from listed page names.** This includes `commands` and `keys`; an unmatched prefix, including a slash-prefixed one such as `/pro`, produces no candidates rather than falling through to file paths. Completion uses the existing case-sensitive word completer, so `help Pro` has no candidate even though page lookup itself is case-insensitive. Arguments after the first return to the ordinary completion chain. The page directory is listed only when completion is at that argument.

### Docs site

15. **The docs site publishes command pages only.** The command and key references remain covered by the existing **Application commands** and **Keyboard shortcuts** pages.
16. **Generated command pages live in a collapsed sidebar group.** **Command Reference** follows **Command Bar** and lists eligible pages alphabetically.
17. **Page headings and sidebar labels use escaped HTML code text.** The original filename remains the route name and link target. Backticks and HTML-sensitive characters in a name display literally instead of changing Markdown or HTML markup.
18. **Pages are generated from `help/` without checked-in copies.** The dynamic route watches `help/*.md`, builds one route per safe command page, and uses the same names for the sidebar. The VitePress development server therefore sees edits to the source help pages.
19. **Each generated page gets one sprite.** The build chooses the character by alphabetical page position from the roster, uses the `south-west` facing, and places the right-floated sprite between the escaped heading and description. The in-app help page contains no sprite markup.
20. **The user-facing command guide names the split references.** Its table has separate rows for `help [<command>]` and `help keys`, its `help` section describes the new behavior and fallback, and it links readers to **Command Reference**. The Tab-completion guide lists help-page names.

### What existing behavior settles

21. **Help replies remain Markdown output.** The command manager renders `output` resolutions as Markdown, including missing-page replies. A shell tab's command bar routes `help` to the application rather than zsh.
22. **The command table and pages stay in sync.** The table remains alphabetical and descriptions remain within 200 characters. Coverage checks require a page for every row and a matching row for every command page.
23. **Lookup is case-insensitive and whitespace-tolerant.** The query is split and normalized before page lookup, so `help  Profile` selects `profile`.
24. **Help is read fresh on each request.** The reader lists the directory and reads the required index and requested page without caching. A changed page is visible on the next request. Completion likewise lists the directory when completing the first help argument.
25. **Unreadable help falls back to the generated summary.** An unreadable or missing directory, an absent or unreadable `commands.md`, an unsafe requested page, or a requested page that cannot be read produces the generated summary listing built-in commands and the `!` / `/` prefixes and `Ctrl+R` history shortcut. A listed but unsafe or unreadable requested page is distinct from a name that is simply missing.
26. **`helper` remains an unknown command.** Only the exact `help` token followed by whitespace or end of input is classified as help.
27. **Help page wording is user-facing.** It describes commands, flags, messages, and behavior without implementation paths or module names. Signatures use the established angle-bracket, square-bracket, and `a|b` notation.

## What already exists (reuse, don't rebuild)

| Need | Existing code or source |
| --- | --- |
| Help command classification, output, and generated fallback | `getOutput`, `parseHelpCommand`, `fallbackHelp` in `src/commands.ts` |
| Reserved `help` command routing | `RESERVED_NON_COMMAND_NAMES` in `src/commands/reserved.ts`, `RESERVED_COMMANDS` in `web/src/overlay-plugins/registry.ts` |
| Command-table ordering, length, and page-coverage checks | `src/commands.test.ts` |
| Page listing, safe path checks, read outcomes, and their regression cases | `src/help-pages.ts`, `src/help-page-files.ts`, `src/help-pages.test.ts` |
| Help completion and its place in command completion | `completeHelpCommand` in `src/completion/handlers.ts`, `completeCommandLine` in `src/completion/index.ts`, and `src/completion/handlers.test.ts` / `src/completion/index.test.ts` |
| Command token normalization before completion | `readCompletionCursor` in `src/completion/cursor.ts` |
| Markdown rendering and help routing from shell tabs | `product/specs/application-commands.md`, `product/specs/shell-tab.md`, and `documentation/user-documentation/advanced-agents/markdown-rendering.md` |
| Safe command-reference names, escaped output, route generation, and sprite assignment | `documentation/.vitepress/command-reference.ts`, `documentation/user-documentation/command-reference/[command].paths.ts`, `scripts/command-reference.test.mjs` |
| Sidebar structure and agent sprite build pipeline | `documentation/.vitepress/config.mts`, `documentation/.vitepress/theme/custom.css`, `ai/guidelines/documentation.md` |
| Dynamic VitePress route convention | `[param].md` and `[param].paths.ts` pages in `documentation/user-documentation/` |
| Help page packaging and an installation file for the sandbox boundary test | `package.json`, `src/sandbox/live.sandbox.test.ts` |
| Command syntax and behavior used to verify page text | `product/specs/agent-command.md`, `product/specs/application-commands.md`, `product/specs/browser.md`, `product/specs/database.md`, `product/specs/file-navigator-tab.md`, `product/specs/harness.md`, `product/specs/monitoring.md`, `product/specs/open.md`, `product/specs/scheduling.md`, and `product/specs/ssh-tab.md` |
| Parser and manager evidence for command-specific examples | `src/agent/command-parser.ts`, `src/browser/command.ts`, `src/database/parsing.ts`, `src/file-navigator/args.ts`, `src/harness/command-parse.ts`, `src/commands/open.ts`, `src/schedule/parsing.ts`, `src/monitor/parsing.ts`, and `src/ssh.ts` |
| Behavior specs for help and completion | `product/specs/application-commands.md`, `product/specs/tab-completion.md` |
| User-facing command descriptions and Tab reference | `documentation/user-documentation/command-bar/commands.md`, `documentation/user-documentation/command-bar/tab-completion.md` |
| Contributors' help-source and sprite rules | `ai/guidelines/documentation.md` |
| Playbooks updated to direct future command and key-binding edits to the correct help pages | `ai/tasks/feature/update-pull-request.md`, `ai/tasks/feature/work-pull-request-issue.md`, `ai/tasks/feature/build-a-feature.md`, `ai/tasks/feature/build-a-complex-feature.md`, `ai/tasks/feature/remove-an-existing-feature.md`, `ai/tasks/fix-a-bug.md`, `ai/tasks/work-an-issue.md`, `ai/tasks/resolve-technical-debt.md`, `ai/tasks/update-documentation.md`, `ai/tasks/research/find-user-documentation-gaps.md`, and `ai/tasks/hygiene/update-package-outside-range.md` |

## Proposed changes

### Help text

- **`help/commands.md`** contains the moved command table and group-target paragraph; its `help` row describes the three help forms.
- **`help/keys.md`** contains the moved key tables and the updated closing Tab-completion paragraph, including help-page completion and the no-candidate result.
- **`help/<command>.md`** provides a page for every row, with the fixed layout and user-facing prose. The completed corrections make the database forms use `sqlite`; distinguish browser window creation from navigation, state that its optional window name has no effect, and remove an unsupported screenshot argument; document bare and named harness launch forms, `capture` and `transcript`, `-y` support for all three harnesses, and `--auto-resume` support for `opencode` and `codex`; use supported `open` forms without an application selector; include every tab and system schedule-management form; describe file-navigator path, target, placement, and detail-mode clauses; document tab/group monitor targets and case-insensitive display aliases, one-at-a-time target removal, `monitor ask`, and `unmonitor --all`; show that agent skill clauses may repeat; omit the roles storage path; distinguish command-bar task insertion from harness-terminal input without submission and with focus returned to the terminal; and show SSH options before the destination with an optional remote command after it.
- **`help.md`** is removed from the installation root.

### Server

- **`src/help-pages.ts`** lists `.md` names, filters them through the shared regular-file boundary, and sorts them. Its reader requires a readable `commands.md` index before handling a query, normalizes the query, removes one leading slash, checks exact membership in the listed page names, and returns one of `page`, `missing`, or `unreadable`. It reads fresh on every call.
- **`src/help-page-files.ts`** shares `regularHelpPagePath` between runtime and documentation generation. It rejects symbolic links and candidates whose resolved paths leave the canonical help directory.
- **`src/commands.ts`** defaults bare help to `commands`, returns a detailed page or the exact missing-page response, and uses the existing generated summary when required help text is unreadable. The old `help.md` cache and section lookup are removed. The parser comment describes an optional page query; `helper` remains outside the help command.
- **`src/help-sections.ts`** and **`src/help-sections.test.ts`** are removed because named-section lookup is no longer a runtime path.
- **`src/completion/handlers.ts`** adds `completeHelpCommand` for the first argument, and **`src/completion/index.ts`** supplies current page names only at that cursor context. Unknown prefixes and slash-prefixed arguments do not fall through to file completion.

### Docs site

- **`documentation/.vitepress/command-reference.ts`** enumerates safe command pages, excludes `commands.md` and `keys.md`, builds an alphabetical collapsed sidebar group, escapes names for both HTML sidebar labels and generated code headings, retains the raw route name, and inserts one roster sprite after the heading.
- **`documentation/user-documentation/command-reference/[command].md`** and **`[command].paths.ts`** provide the dynamic route and watch the source help directory. **`documentation/.vitepress/config.mts`** places the group after **Command Bar**.
- **`scripts/command-reference.test.mjs`** covers escaped sidebar labels and headings, preserved routes, normal page rendering, and symlink exclusion.

### Packaging and tests that name the file

- **`package.json`** packages `help/` instead of the deleted `help.md`.
- **`src/sandbox/live.sandbox.test.ts`** checks `help/commands.md` as an installed file outside the readable `ai/` tree.
- **`src/help-pages.test.ts`** covers listing and reading pages, slash normalization, rejected traversal and unlisted names, missing or unreadable directories and index files, unreadable pages, and symlink exclusion.
- **`src/commands.test.ts`** covers the command/key split, exact page lookup and missing replies, command-table rules, bidirectional page coverage, and `helper` remaining unknown. **`src/commands/commands.test.ts`** verifies bare help excludes key bindings and `help keys` returns them.
- **`src/completion/handlers.test.ts`** covers first-argument completion and unmatched/slash-prefixed names. **`src/completion/index.test.ts`** verifies the real page list is wired into completion without falling through to file paths.

### Docs, specs, and plans

- **`product/specs/application-commands.md`** describes the three help forms, normalization, exact missing-page response, index/read fallback, regular-file and symlink boundary, Markdown replies, shell routing, and the corrected database and schedule help content. **`product/specs/tab-completion.md`** describes completion context and unmatched prefixes. **`product/specs/shell-tab.md`** directs readers to `help keys` for the shell key table.
- **`product/specs/browser.md`**, **`file-navigator-tab.md`**, **`harness.md`**, and **`ssh-tab.md`** record the help-page content and corrected command signatures. The browser help lists all forms and uses `browser shot` without an argument; file help covers its path, target, placement, and detail forms; harness help gives the bare dialog, named launches, `capture`, `transcript`, and supported flag behavior; SSH help places options before the destination and a remote command after it.
- **`product/specs/pull-request-review.md`** now states the standalone repair complexity cutoff and confines the feature-build exception to its own workflow. The completed harness and task-picker repair plans preserve their historical one-time exceptions while stating that future work follows the normal cutoff.
- **`product/plans/ready/sizing-the-window-and-its-areas-from-the-command-line.md`** uses `help/commands.md` for its future row and includes a `help/layout.md` page in its proposed changes and implementation order.
- The user command guide and Markdown-rendering page describe the split help references and generated Command Reference; the Tab-completion guide lists help-page completion. The documentation guideline and task playbooks now identify `help/commands.md`, `help/keys.md`, and `help/<command>.md` as their respective sources.
- The PR's verification description states an isolated expected context and expected observations rather than instructing reviewers to launch the reviewed checkout.

### Implementation order

The branch delivered the feature in four cohesive groups: help pages and runtime reader; first-argument completion; the generated docs route, sidebar, and safety checks; and the aligned specs, command guide, contributor guidance, task playbooks, packaging, and sandbox assertion. Later corrections were folded into these areas so the final branch has one feature plan and no separate completed repair plans.

## Tests

- **Runtime page reader:** `src/help-pages.test.ts` uses temporary directories to verify sorted page names, valid reads, one-slash handling, rejected traversal and unlisted names, unreadable directory/index/page outcomes, and symlinks to missing or outside targets.
- **Command output:** `src/commands.test.ts` verifies bare help equals `help commands`, key tables appear only in `help keys`, command lookup is case-insensitive, unknown names return the exact reply, slash and traversal cases are confined, table ordering and description length hold, each command has one page, and `helper` remains unknown. `src/commands/commands.test.ts` checks the command/key split.
- **Completion:** `src/completion/handlers.test.ts` verifies first-argument candidates, unmatched and slash-prefixed queries, and contexts that return `null`. `src/completion/index.test.ts` verifies completion from the installed help directory and no filesystem fallback for an unmatched prefix.
- **Generated docs:** `scripts/command-reference.test.mjs` verifies escaped malicious labels and headings, raw route preservation, a normal `profile` page with a sprite, and refusal to list or render an outside symlink.
- **Sandbox/package path:** `src/sandbox/live.sandbox.test.ts` uses `help/commands.md` as the installation file outside `ai/`.
- No test snapshots the fixed page layout; review checks that pages have one description and the three ordered blocks.

## Out of scope

- Changing the execution behavior of database, browser, file-navigator, harness, open, schedule, monitor, agent, task-picker, roles, or SSH commands. Their pages and related specs document the existing parser and behavior.
- Keeping the old named-section lookup or matching a multiword command beyond its first word; `help tab` is the page for `tab focus`, while `help tab focus` is missing.
- Adding a "did you mean" response or completing names after a slash.
- Adding links between help pages or publishing `commands.md` and `keys.md` as generated command pages.
- Adding a layout snapshot test or putting sprite markup in in-app help pages.
- Duplicating command pages under `documentation/` or manually editing generated Command Reference routes.
- Changing the original complexity rating or the PR title.

## Verification

- The help reader and completion behavior are covered by the server tests listed above; the generated route, sidebar escaping, symlink handling, and sprite markup are covered by `scripts/command-reference.test.mjs` and the docs build.
- The docs build produces one Command Reference route per safe command page and a collapsed alphabetical sidebar group after **Command Bar**. Generated heading and label names remain code-formatted and literal.
- Expected in-app behavior includes bare help matching `help commands`, `help keys` showing all key tables and completion details, `help Profile` and `help /quit` resolving their pages, `help //quit` and `help ../package` returning the exact missing-page response, `help shell` showing the command page, `help pro` completing to `help profile `, and `help zzz` offering no candidates. A shell tab's command bar handles help as application output rendered as Markdown.
- Command help signatures and examples match their parser/spec sources, including browser open versus navigation, `db sqlite` forms, the supported harness options and launch clauses, all schedule management forms, the file-navigator target/placement/detail clauses, and SSH option order and remote command handling.
- The command reference pages use one generated sprite between each code-formatted heading and its description, with the source text shared with in-app help.
