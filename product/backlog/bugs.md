# bugs

## ready

* when the laptop goes to sleep then resumes, the application stops with the ui disappearing and the server halting. The application should be tolerant of going to sleep and resuming. After the laptop resumes, the application UI and server should still be present and active. 


## development

* Make harness usage errors show their angle-bracket placeholders in a shell tab

Existing Bug: In a shell tab, `harness claude as` answers `Usage: harness <claude|opencode|codex> as .` where the spec promises `Usage: harness <claude|opencode|codex> as <label>.`, and `harness capture` with no name answers `Usage: harness capture .` where the spec promises `Usage: harness capture <name>.`. Severity: 3/10

Existing Risk: 3/10 - Every application usage error that carries a `<placeholder>` reads wrong on a shell tab, the one tab a session opens on, so a user who mistypes a harness command is told less than the spec promises about what the command expects.

Proposal Risk: 2/10 - Escaping the placeholders in the usage strings fixes every message at once, but the narrowness matters: a reply that legitimately contains HTML (a link, a table) must keep rendering, so a broad markdown-escape or an always-on fallback to the ANSI renderer could visibly change other replies.

Proposal: product/specs/harness.md promises `Usage: harness <claude|opencode|codex> as <label>.` for `harness claude as` and `Usage: harness capture <name>.` for `harness capture`. Reproduce it on a fresh launch: in the `janus` shell tab's command bar type `harness claude as` and press Enter, then `harness capture` and press Enter, and read the replies in the terminal. Expected: the two lines read as the spec words them. Observed: `Usage: harness <claude|opencode|codex> as .` and `Usage: harness capture .` — the `<label>` and `<name>` tokens are absent from what is drawn. The root cause is that a shell tab renders an application command's reply as markdown HTML: `insertMarkdownBlock` in `web/src/plugins/shell/markdown-block.ts` calls `renderMarkdown`, which in `web/src/shared/transcript/markdown.ts` is `DOMPurify.sanitize(marked.parse(text, …))`; `marked` passes a raw `<label>` through as an HTML token and `<label>` is a real element DOMPurify keeps, so it becomes an invisible element inside the block rather than visible text, and `<name>` is dropped the same way. The fix is to make the placeholders survive the render: either escape the angle brackets in the usage strings built by `parseHarnessFlags`, `findFlagValue`, and `parseLabelSubcommand` in `src/harness/command-parse.ts` (which also covers `Usage: harness <claude|opencode|codex> --model <value>.` and `Usage: harness <claude|opencode|codex> [options] with <prompt>.`, which travel the same path), or have the shell tab fall back to `markdownToAnsi` in `web/src/plugins/shell/markdown-to-ansi.ts`, which renders `<label>` verbatim. `src/harness/command-parse.test.ts` pins the parser's exact strings, and `web/src/shared/transcript/markdown.test.ts` plus `web/src/plugins/shell/markdown-block.test.ts` cover the two renderers; a regression test should render `Usage: harness <claude|opencode|codex> as <label>.` through `renderMarkdown` and assert the resulting HTML's text content still contains `<label>`.


* Give a file navigator in the center tab strip its location button

Existing Bug: The spec promises every file navigator header carries a location button that cycles the tree through left sidebar → center tab strip → right sidebar → left sidebar; observed on a tree opened with `files`: the header has no location button at all, and once docked the button only toggles left ↔ right and never returns the tree to the center strip. Severity: 3/10

Existing Risk: 4/10 - The center strip is where `files` puts a tree by default, so the promised control is missing exactly where most trees start, and a user looking for it has to already know the `files left` / `files right` / bare `files` commands; a docked tree cannot be sent back from its own header at all.

Proposal Risk: 2/10 - Rendering the button at every placement is additive, but a three-way cycle changes a docked tree's control into one that can leave the sidebar, so the sidebar's own strip and the bare `files` command must stay consistent with whatever cycle is chosen.

Proposal: product/specs/file-navigator-tab.md, "Header buttons": "Every file navigator tab's own header carries a **Search files** button, **New file** and **New directory** buttons, a **detail button**, and a **location button**... The location button cycles the tree through left sidebar → center tab strip → right sidebar → left sidebar, one step per click, with a tooltip naming the destination." Reproduce it: in a shell tab run `files`, then read the tree header's buttons. Expected: a location button among them. Observed: the header carries `files-pull`, `files-commit`, `files-search`, `files-new-file`, `files-new-directory`, `files-detail-cycle`, `tab-split`, and `files-collapse-all`, with no location button (`document.querySelectorAll('.files-dock-cycle').length` is 0); running `files left` then shows the button titled "Move to right sidebar", which toggles to the right sidebar and back to the left and never offers the center strip. The root cause is that `FileNavigatorHeader` in `web/src/file-navigator/FileNavigatorHeader.tsx` renders the button only under `{dock && …}`, while `FileNavigatorTab` in `web/src/file-navigator/FileNavigatorTab.tsx` passes `onCycleDock: dock === undefined ? undefined : () => intents.setDock(nextDock(dock))`, and `ViewTabBody.tsx` renders a center-strip tree with no `dock` prop at all; `nextDock` in `web/src/shared/dock-cycle.ts` only ever returns `'left'` or `'right'`. The fix is to give the center placement a dock state — a three-valued `dock` of `'left' | 'center' | 'right'`, or a nullable cycle target the header can always draw — so the button renders for every tree, and to make the cycle pass through the center strip as the spec describes. `web/src/file-navigator/FileNavigatorHeader.test.tsx` and the callers of `nextDock` in `web/src/shared/dock-cycle.ts` are where the button's presence and cycle are pinned; a regression test should render a center-strip navigator and assert the location button exists, click it and assert the tree is docked into the left sidebar, click it again and assert the tree is back in the center tab strip.


## deferred

*  saw this error: Already monitoring with persona "assistant" monitoring using the same assistant may happen multiple time but for different targets. in this case a new monitoring window should be opened

## declined
