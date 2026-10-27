# `help <command>` should offer specific help on how to use a command including high level descriptions, command signature, use cases and examine commands

**Complexity: 4/10** — the code is small (two plain functions, one completer, one docs route), but about 52 pages have to be written and the change reaches many files: three specs, three docs pages, a guideline, eleven playbooks, packaging, and a sandbox test.

## Summary

Feature request (verbatim from `product/backlog/features.md`): "`help <command>` should offer specific help on how to use a command including high level descriptions, command signature, use cases and examine commands. These explanations should be stored as markdown files <command>.md in a /help directory. move command section in help.md to help/commands.md and Key Bindings section to help/keys.md. `help` alone should execute `help commands`."

Today `help` prints the whole of `help.md`, a one-line-per-command table followed by every key-binding table, and `help <section>` prints one heading or key table out of it (`application-commands.md` § `help`). Neither tells you how to actually use a command. A row like `profile` squeezes four subcommands into 200 characters, and there's nowhere to put an example or say when you'd reach for it. This plan gives each command its own markdown page, reachable as `help <command>`, and splits the current file into `help/commands.md` and `help/keys.md` so the help text lives in one directory. Tab completes the page names, and the docs site publishes the same pages under a new **Command Reference** group, so one file per command serves both places.

## Design decisions

Each decision is settled by the feature text, by behavior the app already has, or by the user's answer, as stated.

### Pages and where they live

1. **`help <command>` prints that command's own help page.** The page covers a high-level description, the command's signature, its use cases, and example commands.
2. **Pages are markdown files named `<command>.md` in a `help/` directory.** The directory sits at the installation root, where `help.md` sits now. `src/commands.ts:30` finds it as `path.join(__dirname, '..', 'help.md')`, which resolves to the root from both `src/` under vitest and `dist/` when installed, and `src/help-pages.ts` finds `help/` the same way.
3. **The Commands section moves to `help/commands.md` and the Key Bindings section to `help/keys.md`.** Each section moves with everything under its heading. The `in group <name|id>` paragraph after the command table goes with Commands, and the closing `Tab` completion paragraph goes with Key Bindings. With both sections moved, `help.md` itself is deleted.
4. **Every command gets a page in this version, and a test keeps it that way.** There is one page for each row of the command table in `help/commands.md`, about 52 today, `help` included. A row's command name is the first word inside its first backticks, the same rule the alphabetical check already uses, so `tab focus <name>` is covered by `help/tab.md` and `newfile <file>` by `help/newfile.md`. A test fails when a row has no page, or when a page other than `commands.md` and `keys.md` has no row. So a new command can't land without its page. The user chose this over writing every page with nothing to enforce it, and over a starter set with the rest falling back to their table row.
5. **Every command page uses one fixed layout.** It opens with a `### <command>` heading, the command name alone, as in `### profile`. A short description paragraph follows. Then come three bold-labelled blocks in this order. **Usage** lists each signature on its own line in backticks. **Use cases** is a bulleted list of situations you'd reach for the command in. **Examples** gives each example as a command in backticks followed by what it does, as in `` `profile save review` saves this session as `review`. `` The bold labels match the style the key tables already use. The user chose this over `####` subheadings and over a free layout. No test checks the layout; review keeps pages to it. The user chose this over testing the heading and labels.
6. **Pages carry no links.** A page that points at another command names it in plain text, as in "See `help schedule`." A relative link would render in-app as a link that goes nowhere, and plain text reads the same in both places. The user chose this over relative links that only the docs site could follow.

### How `help` chooses what to print

7. **Bare `help` prints the same thing as `help commands`.** That's the command table alone. The key-binding tables are no longer part of bare `help`.
8. **`help <name>` prints `help/<name>.md` and nothing else.** That covers `help commands`, `help keys`, and every command page. Today's section lookup is removed, so `help shell` now prints the shell command's page rather than the shell tab's key table. `help editor`, `help shell tab`, `help key bindings`, and `help tab focus` no longer match anything, and the key tables are reached only through `help keys`. The user chose this over keeping section lookup as a fallback after pages, and over falling back to the first word.
9. **One leading slash is ignored.** A command can be typed as `/quit`, so `help /quit` prints the same page as `help quit`. Only one slash is dropped: `help //quit` looks up `/quit` and matches nothing. This is the slash on the page name. The slash on `help` itself is already gone before `getOutput` runs, because `resolveCommand` strips it (`src/resolve.ts`, `trimmed.replace(/^\//, '')`), so `/help /quit` behaves the same. The user chose this over treating `/quit` as a name with no page.
10. **A name counts only when it is one of the directory's pages.** `help <name>` is matched against the `.md` file names actually present in `help/`, never joined onto a path. So `help ../package` or `help a/b` can't reach a file outside the directory. This is the explicit allow-list rule for served files (architecture principle 9) applied to help pages.

### Replies and wording

11. **A name with no page gets one short reply.** `help nosuch`, `help editor`, and `help ../package` all answer exactly `No help for "<name>". Type "help" for available commands.` Its second sentence is the one the unknown-command message already ends with. `<name>` is the name that was looked up: the query lowercased, its spaces collapsed, and one leading slash dropped. So `help /nosuch` answers `No help for "nosuch". …` and `help //quit` answers `No help for "/quit". …`. The reply is ordinary `help` output, so it is never routed as an unknown command. The user chose this reply over listing every page name and over pointing at `help commands` and `help keys`, and chose quoting the looked-up name over the name as typed.
12. **`help/commands.md` carries no pointer line.** It holds the `### Commands` heading, the table, and the `in group` paragraph, as moved. The user chose this over a line pointing at `help <command>` and `help keys`.
13. **The `help` row names all three forms.** Its description becomes exactly `` `help` lists the commands; `help <command>` shows one command's usage, use cases, and examples; `help keys` lists the key bindings ``, which is 130 characters. That's the only row whose text changes, because it's the only one that described `help <section>`. The user chose this over a shorter row and over one naming example commands.

### Tab completion

14. **Tab completes the word after `help` from the page names.** Every page is offered, `commands` and `keys` included, so `help pro` and `Tab` gives `help profile`. A word that matches no page offers nothing rather than falling through to file paths, the way `syntax theme` completion already owns its argument. A word typed with a leading slash, such as `help /pro`, offers nothing; the slash form still runs (Design decision 9), it just doesn't complete. Words after the first fall through to file-path completion, as every command's free arguments already do. The user added completion to this version, and chose bare names over also completing after a slash, and over leaving out `commands` and `keys`.

### Docs site

15. **The docs site publishes one page per command page.** `help/commands.md` and `help/keys.md` aren't published, because **Application commands** and **Keyboard shortcuts** already cover those tables on the site. The user added publishing to this version, and chose command pages only over publishing every help file.
16. **The pages sit in a new collapsed sidebar group.** The group is titled **Command Reference**. It comes right after **Command Bar**, is collapsed by default, and lists every command page alphabetically. The user chose this over an index page alone and over both.
17. **A site page's title is the command name in code font.** The in-app `### profile` heading becomes the site page's top heading, `profile` in code font, and the sidebar entry reads `profile` in code font too. The user chose this over "The profile command" and "profile command".
18. **Site pages are generated from `help/` when the site builds.** No second copy of any page is checked in, so the in-app page and the site page can't drift apart. The page list and the sidebar group come from the same directory listing, so a new command's page appears on the site with no config edit.
19. **Each site page carries one agent sprite.** The documentation rules give every page at least one character beside paragraph text (`ai/guidelines/documentation.md` § Placement rules). The build places it between the page's heading and its description paragraph, floated right with the `south-west` facing, the way right-floated sprites already sit (`documentation/user-documentation/command-bar/commands.md` uses `mahir-south-west.png`). It steps through the `agent-images/` roster in page order, so neighbouring pages show different characters. A page always gets exactly one, whatever its length. The count rule's two- and three-sprite tiers don't apply, because the description is the page's only paragraph and a sprite may sit only beside prose. The user chose exactly one over none, and the guideline records the exception. The help page itself carries no sprite: the in-app renderer can't load the image, so the build adds it.
20. **Application commands gets two rows and one sentence.** In `documentation/user-documentation/command-bar/commands.md`, the `help [<section>]` row becomes two rows. `help [<command>]` reads "List the available commands, or show one command's usage, use cases, and examples", and `help keys` reads "List every key binding". The `help` section gains exactly one sentence, "Every command's page is also on this site, under **Command Reference** in the sidebar.", and no other page changes. The user chose two rows over one, and that sentence over also linking each table row.

### What existing behavior settles

21. **Replies stay markdown.** Every `help` reply, the unknown-name reply included, is an `output` resolution, and `src/command/manager.ts` appends those with `markdown: res.kind === 'output'`, so it renders the way the full text does today (`markdown-rendering.md`). From a shell tab's command bar, the application answers it rather than zsh (`shell-tab.md`).
22. **The command table keeps its rules.** `help/commands.md` stays in alphabetical order by command name, with each description at most 200 characters. `src/commands.test.ts` keeps enforcing both by reading the table through `help commands`, and `ai/guidelines/documentation.md` § Help Command Table names the new file.
23. **Names match without regard to case or extra spaces.** `getOutput` already lowercases and trims the line, and `parseHelpCommand` splits it on whitespace, so `help  Profile` prints the `profile` page.
24. **Pages are read when they're asked for, with no cache.** Each `help` lists `help/` and reads the one page it prints, and each Tab after `help` lists the directory. That's a directory listing and one small file per use, the same cost `completeFilePath` already pays on every Tab, so the cache `help.md` has today buys nothing. An edited page shows on the next `help` without a restart. If the reads ever show up in a profile, caching the listing in `src/help-pages.ts` is the upgrade. The user chose reading fresh over keeping a once-per-run cache.
25. **Unreadable help text falls back to the generated summary.** Today a `help.md` that can't be read makes every `help` form answer with the generated summary `fallbackHelp` builds. The same holds when `help/commands.md` or the directory can't be read, and when a page the directory lists can't be read.
26. **`helper` stays an unknown command.** Only the exact word `help` followed by whitespace or the end of input is `help`.
27. **Page content follows the user-documentation rules.** A help page is read by someone running the app, so it names commands, flags, messages, and behavior only, with no file paths or module names (`ai/guidelines/user-documentation.md` § No implementation leakage). It uses the angle-bracket, square-bracket, and `a|b` notation the specs already use for signatures.

## What already exists (reuse, don't rebuild)

| Need | Existing code |
| --- | --- |
| Answering `help`, reading and caching the help text, generated fallback | `getOutput`, `parseHelpCommand`, `readHelpMarkdown`, `fallbackHelp` in `src/commands.ts` |
| `help` as a reserved, non-registry name | `RESERVED_NON_COMMAND_NAMES` in `src/commands/reserved.ts`, `RESERVED_COMMANDS` in `web/src/overlay-plugins/registry.ts` |
| Reading a table row's command name, alphabetical-order and 200-character checks | `src/commands.test.ts` (`getOutput("help <section>")`) |
| A completer that owns its first argument and offers a fixed word list | `completeSearchCommand`, `completeSyntaxTheme` in `src/completion/handlers.ts`, `completeWord` in `src/completion/helpers.ts` (returns the input unchanged with empty `matches` when nothing matches, so the chain never falls through), the chain in `completeCommandLine` (`src/completion/index.ts`) |
| Completer unit tests and chain tests | `describe('completeSearchCommand')` in `src/completion/handlers.test.ts`, `describe('completeCommandLine — syntax theme')` in `src/completion/index.test.ts` |
| Command word already lowercased with its leading slash stripped | `readCompletionCursor` in `src/completion/cursor.ts` |
| Reading repo files when the docs config loads | `copyAgentImages` in `documentation/.vitepress/config.mts` |
| Sidebar groups | `themeConfig.sidebar` in `documentation/.vitepress/config.mts`; VitePress renders an item's `text` as HTML (`v-html="item.text"` in `VPSidebarItem.vue`), so a `<code>` label works |
| Generated pages with no checked-in copy | VitePress dynamic routes: a `[param].md` template holding `<!-- @content -->` and a `[param].paths.ts` loader whose `watch` globs are passed to `paths(watchedFiles)`, each route carrying `params` and `content` (`RouteModule` in `node_modules/vitepress/dist/node/index.d.ts`) |
| Agent sprite markup and placement rules | `agent-float` in `documentation/.vitepress/theme/custom.css`, `ai/guidelines/documentation.md` |
| Shipping the help text in the npm package | `files` in `package.json` |
| A real install-root file outside `ai/` for the sandbox read test | `src/sandbox/live.sandbox.test.ts` |
| Behavior specs | `product/specs/application-commands.md` § `help`, `product/specs/tab-completion.md` |
| User-facing descriptions | `documentation/user-documentation/command-bar/commands.md` § `help`, `documentation/user-documentation/command-bar/tab-completion.md` |
| Contributor rules for the help text and the docs site | `ai/guidelines/documentation.md` § Help Command Table and § Placement rules |
| Reading a directory on every Tab, the cost the no-cache decision matches | `completeFilePath` in `src/completion/fs.ts` |
| Playbooks that tell an agent to update `help.md` | `ai/tasks/feature/update-pull-request.md`, `ai/tasks/feature/work-pull-request-issue.md`, `ai/tasks/feature/build-a-feature.md`, `ai/tasks/feature/build-a-complex-feature.md`, `ai/tasks/feature/remove-an-existing-feature.md`, `ai/tasks/fix-a-bug.md`, `ai/tasks/work-an-issue.md`, `ai/tasks/resolve-technical-debt.md`, `ai/tasks/update-documentation.md`, `ai/tasks/research/find-user-documentation-gaps.md`, `ai/tasks/hygiene/update-package-outside-range.md` |

## Proposed changes

### Help text

- **`help/commands.md`** (new). The Commands section of `help.md`, moved with its `### Commands` heading, its table, and the `in group` paragraph. The `help` row's description is the one change (Design decision 13).
- **`help/keys.md`** (new). The Key Bindings section of `help.md`, moved unchanged, with its `### Key Bindings` heading, every labelled key table, and the closing `Tab` completion paragraph.
- **`help/<command>.md`** (new, one per table row). Each follows the layout in Design decision 5, carries no links (Design decision 6), and draws its content from the command's spec, rewritten for a user (Design decision 27).
- **`help.md`**. Deleted.

### Server

- **`src/help-pages.ts`** (new). Owns the `help/` directory with two plain functions, each taking the directory, plus the installation's `help/` path, found as Design decision 2 describes. `src/commands.ts` and completion pass that path; a test passes a temporary directory. The first lists the page names: the `.md` file names with the extension dropped, or an empty list when the directory can't be read. The second looks up a query. It drops one leading slash (Design decision 9), takes the name only when it is in the listing (Design decision 10), and reads that file. Its result tells three outcomes apart: the page's text, no such page (carrying the name it looked up, after the slash was dropped, for the reply in Design decision 11), or help text that can't be read (Design decision 25). A missing `commands.md` or an unlistable directory counts as unreadable help text, not as a missing page. Nothing is cached (Design decision 24). The module imports nothing from `src/commands.ts`, so the fallback summary, which needs the command list, stays there and no import cycle forms.
- **`src/commands.ts`**. `helpText` asks `src/help-pages.ts` for `commands` on bare `help` and for the query otherwise. A page answers with its text, a missing page with the reply from Design decision 11, and unreadable help text with `fallbackHelp`. `readHelpMarkdown` and the `helpMarkdown` cache are removed. `parseHelpCommand`, `fallbackHelp`, and `getOutput`'s shape stay as they are.
- **`src/help-sections.ts`** and **`src/help-sections.test.ts`**. Deleted. Nothing calls the section lookup once Design decision 8 removes it, and architecture principle 5 leaves no code path the system never takes.
- **`src/completion/handlers.ts`**. Add `completeHelpCommand(cursor, pages)` beside `completeSearchCommand`. It returns `null` unless the command is `help` and the cursor is on argument 1, and otherwise completes the word from the page names (Design decision 14). `completeWord` already offers nothing for a word that matches nothing, which covers the slash case too.
- **`src/completion/index.ts`**. Add `completeHelpCommand` to the chain in `completeCommandLine`, beside `completeSearchCommand`, passing the page names listed by `src/help-pages.ts` for the installation's `help/`, the way `completeSyntaxTheme` is passed `SYNTAX_THEMES`. When the directory can't be read the list is empty, so `help` offers nothing. The cursor's command is already lowercased with its leading slash stripped (`readCompletionCursor` in `src/completion/cursor.ts`), so `/help pro` completes the same way. `completeWord` matches case-sensitively, so `help Pro` offers nothing, the same as every other completer.

### Docs site

- **`documentation/.vitepress/command-reference.ts`** (new). Reads the command pages from `help/` at the repository root, leaving out `commands.md` and `keys.md` (Design decision 15). It builds the **Command Reference** sidebar group with `collapsed` set and one entry per page, alphabetical, each labelled with the command name in code font (Design decisions 16 and 17). It also turns one help page into a site page: the `### <command>` heading becomes the page's top heading in code font, and a right-floated `agent-float` sprite goes between that heading and the description paragraph, stepping through the roster in page order (Design decision 19). It is its own module because `config.mts` counts about 180 of its 200 lines, and both the config and the route loader below need it.
- **`documentation/user-documentation/command-reference/[command].md`** and **`[command].paths.ts`** (new). A VitePress dynamic route. The template holds only `<!-- @content -->`. The loader sets `watch` to the repository's `help/*.md`, so `docs:dev` picks up an edited page. Its `paths(watchedFiles)` returns one route per command page, with `params.command` set to the page name and `content` set to the converted page from `command-reference.ts`. This is how Design decision 18 publishes pages with no checked-in copy, and each page's URL is `/user-documentation/command-reference/<command>`. Keep the loader a thin call into `command-reference.ts`. Unlike `documentation/.vitepress/`, which `eslint.config.mjs` ignores, this file sits under the base lint rules (`js`, `typescript-eslint`, and `unicorn` recommended), so `lint-files` checks it.
- **`documentation/.vitepress/config.mts`**. Insert the **Command Reference** group from `command-reference.ts` right after **Command Bar**. Its item links use the route URLs above, and each item's `text` is the command name wrapped in `<code>`.
- Nothing under `documentation/.vitepress/` is linted or typechecked (`eslint.config.mjs` ignores it, and `tsconfig.json` includes only `src/**/*.ts`), so `npm run docs:build` is the check for `command-reference.ts` and `config.mts` (see Verification).

### Packaging and tests that name the file

- **`package.json`**. `files` lists `help` in place of `help.md`, so the directory ships in the npm package.
- **`src/sandbox/live.sandbox.test.ts`**. The "nothing else in the install" half reads `help/commands.md` instead of `help.md`, which is still an installation file outside `ai/`.

### Docs, specs, and playbooks

- **`product/specs/application-commands.md`** § `help`. Rewritten for the forms in Design decisions 7 to 11, the files they read, the slash rule, the exact unknown-name reply, and the fallback. The paragraph describing section lookup is removed.
- **`product/specs/tab-completion.md`**. A new rule section for `help`: context is argument 1 of `help`, candidates are the help page names, and a word that matches none offers nothing.
- **`product/specs/shell-tab.md`**. The sentence saying `!` "is documented in `help`" now says `help keys`, because the shell tab's key table no longer prints with bare `help`.
- **`documentation/user-documentation/command-bar/commands.md`**. The two rows and the sentence from Design decision 20. § `help` is rewritten to describe bare `help`, `help <command>`, `help keys`, the unknown-name reply, and the fallback, and it drops the section-lookup examples.
- **`documentation/user-documentation/command-bar/tab-completion.md`**. A table row: after `help`, the help page names, `commands` and `keys` included.
- **`documentation/user-documentation/advanced-agents/markdown-rendering.md`**. The closing sentence, "Use it whenever you need the current command or key-binding list.", names `help` for the command list and `help keys` for the key bindings, since bare `help` no longer prints the keys.
- **`ai/guidelines/documentation.md`**. § Help Command Table names `help/commands.md` in place of `help.md`, and says the **Command Reference** site pages are generated from `help/`, so a page is edited there and never under `documentation/`. A sentence under § Placement rules says those pages get exactly one sprite from the build, whatever their length, as an exception to the count rule, so a help page never carries an `<img>`. This guideline is the one place both facts are written down, rather than also repeating them in `documentation/developer-documentation/documentation.md`.
- **The playbooks listed in the reuse table.** Each instruction to update `help.md` now says to update the command's row in `help/commands.md`, its key table in `help/keys.md`, and the command's own page `help/<command>.md` whenever a change adds, removes, or alters a command. A mention that only names the file, such as an allow-list of editable paths, names the `help/` directory instead. The user chose this over swapping the paths alone, because the coverage test catches a missing page but not a stale one.
- **`product/plans/ready/sizing-the-window-and-its-areas-from-the-command-line.md`**. Whichever of the two plans lands second points its `help.md` row at `help/commands.md` and adds a `help/layout.md` page, which the coverage test will require.

### Implementation order

Land these in order so typecheck and tests stay green at each step:

1. The help text and its reader together: `help/commands.md`, `help/keys.md`, every command page, `src/help-pages.ts`, the `src/commands.ts` change, the deletion of `help.md` and `src/help-sections.ts`, `package.json`, and the sandbox test path. `src/commands.test.ts` reads the real files, and the coverage test fails until every page exists, so none of these can land alone.
2. Completion: `completeHelpCommand`, its place in the chain, and its tests.
3. The docs site: `command-reference.ts`, the dynamic route, and the sidebar group, checked with `npm run docs:build`.
4. Specs, user docs, the guideline, and the playbooks.

## Tests

- **`src/help-pages.test.ts`** (new, replacing `src/help-sections.test.ts`). Against a temporary directory holding `commands.md`, `keys.md`, and `quit.md`: the listing is `commands`, `keys`, `quit`; `quit` and `/quit` return the quit page's text; `//quit`, `../package`, `a/b`, and `nosuch` report no such page, even with a `package.md` one level up. A missing directory, a directory without `commands.md`, and a listed page that can't be read each report unreadable rather than missing, and a missing directory lists no pages.
- **`src/commands.test.ts`** (extend). Bare `help` and `help commands` return the same text, which starts with `### Commands` and holds no key table. The key-binding assertions now in `getOutput("help")` (`Ctrl+E`, `Ctrl+G`) move to `help keys`. The alphabetical-order and 200-character tests keep reading `help commands`. `help shell` returns the shell command's page, replacing the test that expected the shell tab's key table. `help <command>` returns that command's page in any case, and `help /quit` returns the quit page. `help ../package`, `help editor`, and `help nosuch` each answer exactly `No help for "<name>". Type "help" for available commands.` as `help` output rather than an unknown command, and `help /nosuch` quotes `nosuch`. `helper` stays unknown.
- **Page coverage** (new, beside the table tests in `src/commands.test.ts`). Every command-table row has a page, and every page other than `commands.md` and `keys.md` has a row (Design decision 4).
- **`src/completion/handlers.test.ts`** (extend, a `describe('completeHelpCommand')` beside `completeSearchCommand`'s). Against a fixed page list: argument 1 completes `pro` to `profile `, returns empty `matches` for `zzz` and `/pro`, and returns `null` for another command and for argument 2.
- **`src/completion/index.test.ts`** (extend, beside `describe('completeCommandLine — syntax theme')`). Only the wiring, against the real `help/`: `help pro` completes to `help profile `, and `help zzz` offers nothing and no file paths. The other cases live in the unit test above.
- **`src/sandbox/live.sandbox.test.ts`** (existing, one path changed). Still proves the sandbox reads `ai/` but not the rest of the installation.

## Out of scope

- Changing what any command does. This is help text only.
- Changing the one-line rows in the command table, other than the `help` row. They move to `help/commands.md` as they are.
- Changing the key-binding tables. They move to `help/keys.md` as they are.
- Looking up one key table by name. `help keys` prints them all (Design decision 8).
- Matching a command by more than its first word. `help tab focus` matches nothing; `help tab` is the page (Design decision 8).
- A "did you mean" suggestion in the unknown-name reply.
- A test of the page layout. Review keeps pages to it (Design decision 5).
- Links between help pages (Design decision 6).
- Completing a page name typed after a slash (Design decision 14).
- Publishing `help/commands.md` or `help/keys.md` on the docs site (Design decision 15).
- Linking the **Application commands** table rows, or any other existing docs page, to the new pages (Design decision 20).

## Verification

- Run `$janissary/scripts/run.mjs check-diff`.
- Run `npm run docs:build` and confirm it finishes with one **Command Reference** page per command page.
- Manual check, in the app: from an agent tab, run `help` and confirm it prints only the command table. Run `help commands` and confirm the same text. Run `help keys` and confirm every key table and the `Tab` completion paragraph. Run `help profile` and confirm a page with a `### profile` heading, a description, and **Usage**, **Use cases**, and **Examples** blocks. Run `help shell` and confirm the shell command's page, not the shell tab's keys. Run `help /quit` and confirm the quit page. Run `help nosuch` and confirm `No help for "nosuch". Type "help" for available commands.` Type `help pro` and press Tab to confirm it completes to `help profile`. Repeat `help profile` from a shell tab's command bar and confirm the application answers it, rendered as markdown, rather than zsh.
- Manual check, on the docs site: run `npm run docs:dev`, confirm a collapsed **Command Reference** group sits right after **Command Bar**, open it, and confirm the entries are alphabetical and in code font. Open the `profile` page and confirm its heading is `profile` in code font, a sprite floats beside the description without pushing into the **Usage** block, and the text matches `help/profile.md`. Edit `help/profile.md` and confirm the dev server shows the change.
