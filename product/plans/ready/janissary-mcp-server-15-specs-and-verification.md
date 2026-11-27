# docs: add the MCP server spec and the end-to-end verification pass

**Complexity: 1/10** — documentation-only, no production code changed (p=1.58)

## Goal

Write the single behavior spec for the whole feature and carry the cross-cutting end-to-end verification that only makes sense once every earlier subplan has landed. This is the final integration checkpoint: it adds no code and changes no behavior, but it is where the whole feature is described and proven together.

Source: `./product/plans/complete/janissary-mcp-server.md`. Depends on all earlier subplans: `janissary-mcp-server-1-mcp-core.md` through `janissary-mcp-server-14-local-relay.md`.

## Requirements

1. The implementation is verified end to end against the running app, not only through the diff-scoped check command — source plan § Verification.

## Design decisions

- `product/specs/mcp-server.md` is the single behavior spec for the feature. It covers the server (loopback plain HTTP, persisted port and token, `mcpPort`, failure notification), the tool and its four exact errors, cancellation and withdrawal, the `mcp` command's two output blocks, harness injection with `JANISSARY_TAB` / `JANISSARY_MCP_URL` / `JANISSARY_MCP_TOKEN`, and the remote relay with its grace window and `Janissary is not connected.` error.
- The spec uses `[[name]]` cross-references to `agent-questions`, `harness`, `tabs`, `notifications` and `remote-server`, and states exact messages verbatim rather than paraphrasing them.
- Earlier subplans already made the narrow spec edits that belong with their code; this subplan adds only the cross-cutting overview spec and the verification pass, so no spec is edited twice for the same content.

## Preserved behavior

None found.

## Assumptions

1. `product/specs/` is the authoritative behavior documentation and a behavior change ships its spec update in the same change — `ai/guidelines/architecture-principles.md` §10 and `ai/guidelines/developer-documentation.md` § Specs describe behavior precisely.
2. Every plan ends with `$janissary/scripts/run.mjs check-diff` plus at least one reader-performable manual check — `ai/guidelines/plan-template.md` § Verification.
3. The feature's observable behavior is fully specified in the source plan's numbered requirements and verification steps — `./product/plans/complete/janissary-mcp-server.md`.

## Existing functionality

1. Existing behavior specs that the new spec cross-references — `product/specs/agent-questions.md`, `product/specs/harness.md`, `product/specs/tabs.md`, `product/specs/notifications.md`, `product/specs/remote-server.md`.
2. The diff-scoped verification command — `$janissary/scripts/run.mjs check-diff`.

## Implementation steps

1. Create `product/specs/mcp-server.md` with the sections described above, using exact error and output strings and `[[name]]` cross-references. State that the server is local-only, plain HTTP on loopback, uses a token separate from the application's session token, and that the remote hop relays commands in band over the session connection. Confirm each of the six referenced spec files still describes the behavior the earlier subplans added. Build and check with `$janissary/scripts/run.mjs check-diff`.
2. Run the end-to-end verification pass below against a running app and record any mismatch as a gap in the responsible earlier subplan rather than as an implementation fix here. Build and check with `$janissary/scripts/run.mjs check-diff`.

This is a documentation-only subplan: its file list is a single new spec file and therefore compiles and passes `check-diff` on its own, with no dangling reference to any later work.

## UI design

1. No UI changes. This subplan describes the surfaces earlier subplans built: the question panel, the metadata flag, the unread badge, and the New harness dialog checkbox.

## Tests

- No new tests: this subplan adds no application code. It verifies the existing tests from all earlier subplans still pass together under `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Any additional behavior, tool or command.
- Editing the user documentation site; a user-facing guide is a separate follow-up, not a requirement of this plan.
- Changing any spec content already written by an earlier subplan.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Then perform these concrete end-to-end checks against the running app:

1. Type `mcp`: expect `status: running`, an `url: http://127.0.0.1:<port>/mcp` line, `port:` and `tools: question`, with no token. A failure is `status: not running` with a `reason:` line while the server should be up.
2. Open `harness claude as asker`, switch to another tab, and ask claude to "use the janissary question tool to ask me 'Ship it?' with options yes and no, on tab $JANISSARY_TAB". Expect the `asker` tab to get the unread flag and a `Question from asker` notification, its metadata server flag to turn green, and the approval panel with **yes**, **no** and **Cancel** when you switch to it. Clicking **yes** returns `yes` to claude and focus lands back in the terminal. A failure is claude answering in its own UI, a timeout, or no panel.
3. Repeat with `harness codex` and `harness opencode`, leaving the question unanswered for more than two minutes before answering, to confirm neither harness abandons or backgrounds the call.
4. Open `harness claude as off --offline`, then the New harness dialog: claude's `/mcp` lists no `janissary` server, and checking **Offline** clears and disables **MCP server**.
5. On a remote host, run `harness claude as far on <host>` and repeat step 2: the panel opens on the local `far` tab and the answer returns to remote claude. Ask again, Detach from the Sessions tab and Attach within a minute: the panel reappears on the rebuilt `far` tab. Detach again and wait past 60 seconds: the call fails in claude with `Janissary is not connected.`
