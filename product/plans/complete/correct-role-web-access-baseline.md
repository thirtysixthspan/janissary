# Correct the role web-access baseline in the description and plan

**Complexity: 1/10** — no production code, no production files edited, no test scenarios; two one-sentence web-access corrections (p=2.35).

## Goal

The pull request body's What section and the Goal paragraph of `product/plans/complete/web-search.md` both justify the feature with the same false baseline: that a role session has no way to look anything up, and that an agent can only answer from what it already knows or what is in the workspace.

The built-in roles contradict that. `src/plugins/roles/roles-file.ts` grants the default `ask` role `browser goto` and `browser content`, and the default `tell` role adds `browser eval`. `browser goto <url>` navigates to a page (`src/browser/command.ts`), `browser content` returns its rendered text, and the browser entry in `src/acp/tool-table.ts` exposes those grants to the ACP tool loop. Both `help/ask.md` and `help/tell.md` describe the browser grants, and `documentation/user-documentation/advanced-agents/acp-agent.md` says the default ask role can "browse to a page and read its content". So a role agent can already open a page and read it; what it cannot do is search the web for one.

The corrected baseline names the narrow true gap: a role session has no way to search the web, and the only web access a granted role already has is browsing a page whose address the agent knows.

## Approach

Correct the two sentences that carry the claim, in the two places that carry them, and leave everything else byte-for-byte:

- **Pull request body, What section, first paragraph.** Change "Today a role session has no way to look anything up." to "Today a role session has no way to search the web." Keep "Every harness built-in tool, web search included, is denied," and replace its trailing "so an agent can only answer from what it already knows or from what is in the workspace" with "so the only web access a granted role already has is browsing a page whose address the agent knows."
- **`product/plans/complete/web-search.md`, Goal paragraph, third sentence.** The same two corrections, keeping the sentence's `product/specs/acp.md` citation: "Today a role session has no way to search the web: every harness built-in tool, web search included, is denied (`product/specs/acp.md`, Provider and model), so the only web access a granted role already has is browsing a page whose address the agent knows."

The plan's Goal paragraph otherwise stays byte-for-byte, as do the description's later What paragraphs, its Behavior examples, its Screenshots, its How to verify section, and its workspace-fix paragraph.

## Design decisions

1. **Keep the harness-built-in denial.** The claim that no harness built-in tool, web search included, is available to a role is true and is the reason the feature routes search through a granted native command. Only the trailing conclusion was wrong.

2. **Name the browser baseline in one clause.** "Browsing a page whose address the agent knows" states both what the granted browser commands do and why they are not a search: the agent must already have the address. It avoids enumerating `browser goto` and `browser content` in a paragraph about web search, and it stays true of `tell`'s extra `browser eval`.

3. **Correct both documents.** The body and the plan state the same justification, so fixing only one leaves the overclaim in the other for the next author to copy.

4. **No code, test, spec, or help-page change.** The grant lists, the browser command, the tool table, both help pages, and the ACP agent documentation already describe this behavior correctly. This is a description-and-plan correction with no runtime surface.

## Implementation steps

1. In `product/plans/complete/web-search.md`, replace the Goal paragraph's third sentence with the corrected sentence above. Confirm the paragraph's first two sentences and the rest of the file are unchanged.
2. Run `$janissary/scripts/run.mjs check-diff` and confirm it exits 0.
3. Move this plan from `draft/` to `ready/`.
4. Move this plan from `ready/` to `complete/` and remove the resolved entry from `product/backlog/pull-request.md`, restoring the comment-and-heading skeleton since no entry remains.
5. Commit and push the corrected plan paragraph, the completed plan, and the drained backlog.
6. After the push, rewrite the pull request body's two sentences from the What section's first paragraph, leaving every other paragraph exactly as the author wrote it, and apply it with `gh pr edit --body-file ./temp/pr-body.md`.
7. Read the corrected sentences beside `src/plugins/roles/roles-file.ts`, `src/browser/command.ts`, the browser entry in `src/acp/tool-table.ts`, `help/ask.md`, `help/tell.md`, and `documentation/user-documentation/advanced-agents/acp-agent.md`, and confirm the description's later statements about `web search`, its tokens, and the workspace fix are unchanged.

## Tests

No automated tests. The change is prose in one plan paragraph, the pull request body, and a backlog entry, so there is no test surface. Run `$janissary/scripts/run.mjs check-diff` after the edit and confirm it exits 0.

Manual verification: read the corrected sentences and confirm each says a role session cannot search the web, keeps the harness-built-in-tool denial, and names browsing a known page address as the only existing web access; confirm the grant lists and help pages above still say what the sentences now say; and confirm no other paragraph in either document changed.

## Spec and documentation

None needed. `product/specs/acp.md`, `product/specs/roles.md`, `product/specs/web-search.md`, `help/ask.md`, `help/tell.md`, and `help/web.md` already describe the browser and search grants correctly. The correction only brings intent documents into line with them.

## Out of scope

- Changing any code, test, spec, or help page.
- Rewording the rest of the Goal paragraph, the description's other What paragraphs, or the workspace-fix paragraph.
- Changing the pull request title.
- The `web search` behavior, its flags, its tokens, or its remote routing.
