# features

## ready

* the ssh tab (`product/specs/ssh-tab.md`) is a raw PTY you start by typing a full `ssh <destination>` every time, with only live connections listed in the connections panel; Termius keeps hosts, groups, SSH keys, snippets and port-forwarding rules in a vault and connects to a saved host in one click, with built-in SFTP transfer. Closing this means adding a saved-host list (destination, key, group, label) that launches an ssh tab from a pick or command, and folding the existing remote navigator into that flow so file transfer becomes a first-class action on a saved host. Complexity: medium-high.

## development


## deferred

* Bundle janissary as a mac application that can be dowloaded and installed into /Applications and launched from an icon in the toolbar.

* Durable flows across relaunch - capture exit information from a harness and be able to use it to restart a session. a relaunch harness picker. workspace dir would need saved and re-created.

* the SQL browser's console (`product/specs/sql-database.md`) has no completion at all ("Tab here does not complete a word: there is nothing in this tab for a word to be completed against"), and the spec rules out a query builder or statistics panel; DBeaver's SQL Assist autocompletes table and column names, SQL keywords and functions from the database catalog, and its ER diagrams and visual query builder make the schema explorable and composable. Closing this means adding schema-aware autocomplete to the console using the connection's own catalog, with an ER diagram view of the selected database as a larger follow-on. Complexity: medium for autocomplete, high for a diagram view.

* the editor tab (`product/specs/editor-tab.md`) colors text for a handful of languages but offers no code navigation: no go-to-definition, symbol outline or breadcrumbs, no bracket matching or folding, and indentation is a fixed two spaces with nothing auto-closing as you type. VS Code's editor jumps to a symbol's declaration with F12, lists every symbol in the Outline view, highlights matching brackets and folds regions, and auto-closes brackets and quotes. Closing this means wiring a language server or a lightweight symbol index for the editor's supported languages so symbols can be jumped to and listed, plus the cheaper editor affordances IDE users treat as table stakes. Complexity: high.


## declined

* the search tab (`product/specs/search-tab.md`) searches the whole project with regex, case and whole-word toggles but is read-only and shows no match tally ("There is no tally: the header shows no count of matches or files"); VS Code's Search view has a Replace box beside the query, previews a diff of the pending edits, and replaces one match, all in one file, or across the workspace, alongside a "N results in M files" count. Closing this means adding a replace field with a diff preview and per-match/per-file/replace-all actions, a result count in the header, and some signal for when the silent 250-match cap is hit. Complexity: medium-high.

* the history picker (`product/specs/history.md`) lists recent commands for Up/Down navigation only, and the global history carries no context beyond the command text; iTerm2's shell integration exposes a searchable command-history popup, while Atuin fuzzy-searches a context-rich history recording the directory, exit code and duration of every command. Closing this means giving the picker a query field with fuzzy/substring filtering over the global history and showing the directory and result of each command on its row, so a command from another tab or an earlier run can be found by typing rather than by walking a capped list. Complexity: medium.

* the file navigator's Search files pop-up (`product/specs/file-navigator-tab.md`) matches a case-insensitive substring of the filename only, ranks by prefix then shortest path, and exposes a single best match with no result list; VS Code's Quick Open does fuzzy subsequence matching over the full relative path and shows a ranked list you can arrow through. The application's own global Quick Open (`product/specs/quick-open.md`) already implements that fuzzy path ranking and ten-row list — closing this means reusing the same matcher and result presentation inside the navigator's pop-up so searching a tree feels like Go to File rather than one best guess. Complexity: low-medium.

* the markdown tab (`product/specs/markdown-tab.md`) renders a one-time snapshot with no heading navigation, no clickable relative links and no update when the file changes on disk ("later edits to the file on disk are not reflected until it is opened again"); Obsidian's reading view has an Outline/table of contents, live internal links with backlinks and page previews, and VS Code's Markdown preview follows the source as it is edited. Closing this means building a heading outline with jump-to-heading, resolving relative links (images and .md files) into open actions, and watching the source file so the rendered view refreshes on external change. Complexity: medium.

* the browser command (`product/specs/browser.md`) can navigate, read rendered text, eval JavaScript and take a viewport screenshot, but exposes no inspection of what happened — no DOM snapshot, network request list, console messages or locator picker; Playwright's Inspector and Trace Viewer provide all of these with a timeline you can step and scrub through. Closing this means recording a lightweight trace per window (requests, console output, DOM snapshots) and adding subcommands or a viewer tab that lists and inspects it, so browsing by the user or an agent can be debugged after the fact rather than only through `browser eval`. Complexity: high.

* the diff tab (`product/specs/diff-tab.md`) is deliberately read-only ("nothing in the tab stages, discards, or commits"), so acting on a reviewed change always means leaving the tab for a shell or the file navigator; VS Code's Source Control view and diff editor let you stage or revert an individual hunk or selected lines right where you are reading them. Closing this means adding per-hunk stage/discard actions that use the same git plumbing the navigator's commit-to-origin already relies on, with the affected row updating in place after the operation. Complexity: medium.

* the editor tab (`product/specs/editor-tab.md`) has a Cmd+F find overlay, but matching is case-insensitive contiguous substring with "no regex, case, or whole-word options" and no replace — VS Code's editor find has all three toggles, a replace field with replace-one/replace-all, and a visible match count. Closing this means adding the toggles and a replace row to the editor's find overlay, with in-buffer highlighting and one undo step per replace, much as the project search tab already offers regex/case/whole-word toggles for the whole codebase. Complexity: medium.
