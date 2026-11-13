# Bring the remote user documentation in line with host-tool writes and edits
**Complexity: 1/10** — 0 production lines, 0 production files, 3 documentation requirements (p=2.55)

## Goal

Make the user documentation say what `product/specs/acp.md` and `product/specs/remote-server.md` already say: a remote tool loop's granted `file write` and `file edit` run in the remote clone, and a remote text edit waits up to ten minutes like other long remote operations.

## Approach

Documentation only. Extend three existing paragraphs in place; add no new pages or sections. Leave the autonomous `agent` paragraphs alone, since that command still refuses mutations.

## Implementation steps

1. `documentation/user-documentation/advanced-agents/acp-agent.md`: in the paragraph starting "`file read` reads the workspace on the host running the agent", say granted `file write` and `file edit` run there too, so on a remote tab they change only the remote clone, and that a typed write or edit carries no tag.
2. `documentation/user-documentation/advanced-agents/remote-agents.md`: in the remote `ask` paragraph, say the tool loop's reads, writes, and edits happen in the host's workspace clone; add text edits to the ten-minute list.
3. `documentation/user-documentation/tab-types/file-navigator.md`: add text edits to the ten-minute list.

## Tests

No code changes, so no new tests. Verify with `check-diff` and a grep for `file read` across the user documentation.

## Specs

None; `acp.md`, `remote-server.md`, and `file-navigator-tab.md` already describe this behavior.

## Out of scope

The autonomous `agent` command paragraphs, the `Protected file` refusal (no user page documents mutation refusals), and other backlog entries.
