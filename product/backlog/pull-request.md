<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the plan's behavior-spec updates to distinguish plain-text ACP snapshots from rendered Markdown views.

Existing Issue: The new behavior specs say ACP transcript snapshots render formatted Markdown and offer clickable web links, but the retained snapshot route writes a plain-text capture and opens it in the editor. Severity: 3/10

Existing Risk: 3/10 - Contributors following these authoritative specs can mistake a plain-text capture for a rendered view and incorrectly implement or diagnose formatting and link behavior.

Proposal Risk: 1/10 - A prose-only correction cannot change runtime behavior, and its remaining wording risk can be checked directly against the snapshot routing and editor rendering code.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "correct ACP snapshot rendering claims in behavior specs". In product/specs/markdown-rendering.md, remove transcript snapshots from the list of formatted Markdown surfaces and distinguish plain-text snapshots from the retained shared transcript renderer. In product/specs/embedded-web-page.md, remove the claim that clicking a web link in an ACP transcript snapshot opens a page; retain the actual connection-answer and shell-reply link routes. In product/specs/shell-tab.md, replace the new comparison to formatted transcript snapshots with the shared Markdown renderer or connection answers. Ground the wording in src/controller/transcript.ts, src/tab/transcript/text.ts, src/harness/capture/file.ts, src/open/file-manager.ts, web/src/editor/EditorTab.tsx, and web/src/editor/EditorLines.tsx: the snapshot is written as a .txt file and opened through the plain-text editor, not the Markdown renderer. Preserve all runtime behavior, snapshot actions, and the separate contributor/user documentation deferral to subplan 07. Verify the corrected prose against the existing routing cases in src/controller/transcript.test.ts, the plain-text editor coverage in web/src/editor/EditorTab.test.tsx, and the actual rendered-link path in web/src/shared/transcript/transcript-line.tsx; no new renderer or snapshot behavior is requested.
