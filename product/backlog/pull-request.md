<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the security gap that lets a help-page filename inject markup into the Command Reference sidebar.

Existing Issue: `commandReferenceSidebar` inserts each filename from `help/` into a `<code>` label, and VitePress renders sidebar `text` as HTML, so a crafted `.md` filename can create active markup in the published docs navigation. Severity: 7/10

Existing Risk: 7/10 - A crafted page name can execute script in a docs reader's browser when the sidebar renders, exposing the docs origin and reader session to persistent cross-site scripting.

Proposal Risk: 2/10 - Escaping or rejecting unsafe names before building sidebar HTML leaves only the fixed `<code>` markup active, so filenames cannot inject elements or event handlers.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "prevent help page names from injecting HTML into the docs sidebar". In `documentation/.vitepress/command-reference.ts`, change `commandReferenceSidebar` so names from `commandNames()` cannot become markup inside the `<code>` label: HTML-escape the name at the rendering boundary or validate it against the command-name grammar before interpolating it, while keeping the raw name only for its route link. Add a focused regression check with a name containing HTML delimiters and an event-handler attribute, confirming it is escaped or rejected and that ordinary command names still produce code-formatted labels. Confirm the **Command Reference** links remain mapped to their existing routes and that the generated sidebar does not create active markup from a filename; run the documentation build and the focused check.
