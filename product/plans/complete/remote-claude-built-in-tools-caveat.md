# Carry the remote claude built-in-tools exception into the ask, tell, ACP agent, and roles docs

**Complexity: 1/10** — no production lines or files, 1 requirement, no test scenarios (p=2.07)

## Goal

Subplan 4 (`product/plans/complete/deny-internal-tools-4-internal-tool-policy.md`) turned a role connection's harness built-in tools off at launch, but a `claude` role session hosted on a remote machine still gets them, because `createRemoteAcpSession` in `src/remote/acp-session.ts` does not forward `sessionMeta` on the remote launch frame. `product/specs/acp.md` already says so: such a session runs with the permission-request denial alone. Four other documents added on this branch state the promise without the exception: the Notes bullet in `help/ask.md` and `help/tell.md` ("The agent has no built-in tools: no shell, file, or web tools of its own."), the paragraph in `documentation/user-documentation/advanced-agents/acp-agent.md` ("The agent has no built-in tools of its own, such as a shell, file editing, or web search"), and the `## ACP role behavior` sentence in `product/specs/roles.md` ("Role connections deny all of their harness's internal tools"). On a remote tab that promise is false: Claude Code's read-only tools, such as Read, Glob, and Grep, run without raising a permission request. The four documents should state the exception the code actually has.

## Design decisions

- Add one sentence, worded identically in all four documents, right after the promise it qualifies: "For now, a `claude` role session hosted on a remote machine keeps its built-in tools: it can still read files, and every permission request it raises is denied."
- Reuse the phrase "a `claude` role session hosted on a remote machine" from the existing `product/specs/acp.md` clause, so one search finds all five places when the remote launch frame learns to carry `sessionMeta` (the draft subplan 6, `product/plans/draft/deny-internal-tools-6-remote-session-meta.md`) and the caveat is removed.
- In the two hard-wrapped files (`product/specs/roles.md` and `acp-agent.md`), put the sentence on its own source line. Markdown joins it into the same paragraph, and a later removal deletes one whole line without rewrapping its neighbors.
- Leave `product/specs/acp.md` as it is. Its clause already states the exception.
- Change no code. `src/acp/launch.ts`, `src/acp/internal-tools.ts`, and `src/remote/acp-session.ts` stay as they are. The remote `sessionMeta` gap is still open on the branch, so the clause is needed.

## Implementation steps

1. `help/ask.md`: append the sentence to the Notes bullet that starts "The agent has no built-in tools", after "It can only run the granted native commands."
2. `help/tell.md`: make the same change to its matching Notes bullet.
3. `documentation/user-documentation/advanced-agents/acp-agent.md`: add the sentence on its own line after "only run the native commands its role grants."
4. `product/specs/roles.md`: in `## ACP role behavior`, add the sentence on its own line after "the agent can run the granted commands that are enabled for agents and nothing else."
5. Reread each edited paragraph against the `product/specs/acp.md` clause, and confirm the four copies match character for character.

## Tests

- No new tests. The change is documentation only, and no test asserts the wording of these paragraphs.
- Run `src/help-pages.test.ts` and `src/commands.test.ts`, which read the help directory and the `help commands` table, to confirm the edited help pages still list and render.

## Spec and docs updates

- `product/specs/roles.md`: the sentence above, qualifying the role-connection denial.
- `help/ask.md`, `help/tell.md`, and `documentation/user-documentation/advanced-agents/acp-agent.md`: the same sentence.

## Out of scope

- Forwarding `sessionMeta` on the remote launch frame, which is the draft subplan 6.
- Editing the subplan 6 draft to name these four documents.
- Any change to `product/specs/acp.md` or to code.
