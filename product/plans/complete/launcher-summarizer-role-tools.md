# Give the launcher summarizer its role's tools

**Complexity: 2/10** — 1 changed line in 1 production file, 4 requirements and 4 test scenarios, no new units (p=3.76)

## Goal

The launcher's summarizer session runs under the role declared by the first line of its persona, which is `ask` by default. It currently also passes `{ withoutTools: true }` to `startAcp`, so the core role primer tells the model `You have no tools; answer in prose.` followed only by the Markdown instruction. The primer should instead explain the role's tools: the tool table, the built-in-tools denial line, the command-exchange protocol, the ask instruction, and the Markdown instruction. Remove the tab-wide no-tools override from the launcher's start request so its session uses the declared role's tool table and the correct primer.

Issue text: "the launcher has the ask role but no tools. The preamble should explain the ask tools but incorrectly states: You have no tools; answer in prose. Write your replies in GitHub-flavored Markdown (headings, lists, tables, fenced code blocks, etc.); the tab renders them as formatted Markdown."

## Design decisions

- The core ACP pipeline already builds the right primer from two inputs: the tab's `acpWithoutTools` flag and the role's grants. With a tool table it emits the tool primer, the allow-list line, `NO_BUILTIN_TOOLS_LINE`, the disabled-harness-tools line, the command-exchange protocol, the ask instruction, and the Markdown instruction. With `withoutTools` it emits only `NO_TOOLS_LINE` and the Markdown instruction — the two lines quoted in the issue. No core primer code changes.
- `withoutTools` is a tab-wide policy that `startAcp` records on the answering tab and that holds for every prompt on the session. Removing it from the launcher's request leaves the launcher tab with no such policy, so the role's grants drive the tool table and the primer on every flush, including after session replacement and re-priming.
- The launcher passes only `{ role }` now. The role still comes from the persona's `[//]: # role:` directive through `readPersonaRole`; unknown-role and no-enabled-model failures keep their existing handling in the summarize intent.
- The summarizer's own work is unchanged: the persona body, reply format, and trust-framing prompt; the per-tab cursors and flush interval; the session-identity re-prime; and the published status paragraphs. The command gate still restricts execution to commands the role grants and that `commands.json` enables for agents, and the shipped persona still tells the model not to run commands.
- The core `startAcp({ withoutTools: true })` capability remains for plugins whose reply is only ever read; only the launcher stops using it.

## Implementation steps

1. In `src/plugins/launcher/summarizer.ts`, change the `startAcp` call in `summarizeOnce` from `{ withoutTools: true, role }` to `{ role }`. No other production code changes.
2. Update the launcher tests that pin the start request, and add one that names the new behavior (see Tests). Run `$janissary/scripts/run.mjs check-diff`.
3. Update the functional specs and the two existing documentation passages that describe the summarizer as tool-less (see Spec and docs updates). Run `$janissary/scripts/run.mjs check-diff`.

## Tests

- `src/plugins/launcher/summarizer.test.ts`: drop `withoutTools` from the `starts` array type and the `startAcp` stub signature; rename the "starts its session with the declared role and no tools" case and change its expectation to `[{ role: 'planning' }]`; add a case asserting the single start request has no `withoutTools` key so the core primer explains the role's tools; change the "keeps the declared role on every flush, including a re-prime after session replacement" expectation to two `[{ role: 'planning' }]` requests.
- `src/plugins/launcher/activate.test.ts`: drop `withoutTools` from the `starts` array type and change the summarize intent's start-request assertion to `[{ role: 'planning' }]`.
- Unchanged and still passing: `src/acp/run-prompt.test.ts` already pins that a tool-enabled ask primer contains the tool table, the allow-list line, `NO_BUILTIN_TOOLS_LINE`, the command protocol, the ask instruction, and the Markdown instruction, while a `withoutTools` primer contains only the no-tools and Markdown lines. That is the behavior the launcher now selects.

## Spec and docs updates

- `product/specs/launcher.md`: the summarizer is no longer tool-less — it runs under its persona's declared role with that role's tools, and its primer explains them; the trust framing remains the data/instruction boundary.
- `product/specs/acp.md`: the persona-consumer paragraph no longer says the launcher summarizer keeps a tool-less session.
- `documentation/developer-documentation/tab-plugins.md`: the `startAcp` example no longer cites the launcher's summarizer as a caller that asks for `withoutTools: true`.
- `documentation/user-documentation/tab-types/launcher.md`: the summarizer's session now uses the commands granted to its persona's role rather than having no tools.

## Out of scope

- Changing core primer assembly, the no-tools line, the tool table, or the `startAcp` `withoutTools` capability.
- Changing the launcher persona text, its role declaration, or any role's command grants.
- Changing the summarizer prompt, its reply format, cursors, flush interval, session replacement, or the published paragraphs.
- The other two entries on this pull request's backlog.

## Verification

`$janissary/scripts/run.mjs check-diff` after each step; all lint, typecheck, and test checks pass.
