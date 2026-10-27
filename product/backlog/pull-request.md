<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Close the security gap in generated Command Reference headings so filenames cannot inject active HTML.

Existing Issue: `renderCommandPage` interpolates the raw help-page filename into a Markdown code span, so a name containing Markdown delimiters can close the span and insert raw HTML into a generated docs page. Severity: 8/10

Existing Risk: 8/10 - A crafted `.md` filename can inject active markup into the published Command Reference and execute script in a docs reader's browser.

Proposal Risk: 2/10 - Context-appropriate escaping of the heading text would prevent a filename from becoming active markup while retaining its display name and route.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "escape help-page names in generated command headings". In `documentation/.vitepress/command-reference.ts`, encode the page name for the Markdown/HTML context used in `renderCommandPage` instead of inserting raw text into an inline-code span; preserve the code-formatted heading, sprite placement, and raw route identity. Add regression coverage to `scripts/command-reference.test.mjs` for a name containing a backtick and HTML event-handler markup, verifying the generated page cannot contain executable markup, and retain the ordinary `profile` heading case. Verify the generated route still renders a `profile` page and run the docs build and focused check.


* Close the security gap that lets a listed help-page symlink serve files outside the help directory.

Existing Issue: `listHelpPages` and `readHelpPage` accept every `.md` directory entry, then `readFileSync` follows a page symlink to its target path. Severity: 8/10

Existing Risk: 7/10 - A packaged or altered help symlink can disclose local file contents through an in-app response or a generated docs page.

Proposal Risk: 2/10 - Rejecting symlinks or enforcing resolved-path containment before reading prevents a help entry from escaping the configured directory.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "confine help-page reads to the help directory". In `src/help-pages.ts` and `documentation/.vitepress/command-reference.ts`, accept only regular help pages whose resolved targets remain inside the configured help directory before reading them. Add a `src/help-pages.test.ts` case with a valid `commands.md`, an outside file, and a `.md` symlink to that file; verify the symlink cannot return the outside contents while existing unreadable and valid-page cases retain their behavior. Add focused coverage for the docs-page reader as well, so a symlink cannot publish outside contents. Run the existing scoped checks and docs build.


* Correct the plan's SSH option order in the command help signature.

Existing Issue: `help/ssh.md` puts `[ssh options…]` after `<destination>` even though the same page says connection options precede the destination and its port and identity example uses that order. Severity: 4/10

Existing Risk: 5/10 - Readers following the signature may treat options such as `-p` as the remote command instead of connection options, leading to failed or unintended SSH sessions.

Proposal Risk: 2/10 - Matching the usage signature to SSH's argument order removes the ambiguity while the parser and execution remain unchanged.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "correct SSH help option ordering". In `help/ssh.md`, present SSH options before the destination and a trailing remote command after it, such as `ssh [ssh options…] <destination> [remote command…]`. Update the stale signature in `product/specs/ssh-tab.md` to match while preserving its pass-through description, and keep the `-p`/`-i` and remote-command examples consistent. Verify the forms against `src/ssh.ts` and `src/ssh.test.ts`, including options before the destination and trailing remote-command tokens; runtime behavior remains unchanged.


* Deliver the plan's fixed help-page layout in the pages that add free-standing prose.

Existing Issue: `help/browser.md` and `help/files.md` put explanatory paragraphs after Usage, `help/schedule.md` puts one after Use cases, and `help/ssh.md` adds a second unlabelled paragraph before Usage, so these command pages do not follow the required description, Usage, Use cases, Examples sequence. Severity: 3/10

Existing Risk: 3/10 - Different page structures weaken the predictable scan pattern, although the command guidance remains available.

Proposal Risk: 1/10 - Moving each note into the description or its relevant labelled block restores the same layout without losing information.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "restore the fixed layout on command help pages". Adjust `help/browser.md`, `help/files.md`, `help/schedule.md`, and `help/ssh.md` so each has one opening description followed by the Usage, Use cases, and Examples blocks in that order. Move the explanatory prose into the description or relevant labelled block without dropping factual details. Compare the four pages directly with the fixed format in `product/plans/complete/help-command.md`; the plan deliberately has no layout snapshot test, so verify the structure by inspection and leave runtime behavior unchanged.
