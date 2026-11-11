# ACP tool loop 26 — specs and user documentation

**Complexity: 1/10** — no production code, 8 documented requirements (p=3.13)

Run order: 26 of 27 in the ACP tool loop series. Source plan: `product/plans/complete/move-janissarys-acp-tool-loop.md` ("Specs and docs", every bullet except the help pages, which subplan 5 already shipped because `src/commands.test.ts` requires them with the command). Depends on subplans 1 through 25, whose behavior it describes.

The series changes behavior that five specs and two user pages describe:
- the ACP tool loop now runs where the workspace is for remote runs;
- every native command has a side;
- settings are snapshotted per prompt;
- `file read` exists, and `ask` and `tell` grant it by default;
- remote workspace steps carry a host tag;
- the protocol is at version 40.

This subplan brings each document in line, in one pass, so a reader of any of them sees the finished design rather than a half-moved one. It changes no code.

## Design decisions

- Specs follow `ai/guidelines/developer-documentation.md`. They name the implementing modules (`drive-loop.ts`, `serve-acp-loop.ts`, `src/file-read/`), state every message verbatim, and give edge cases their own place.
- User pages follow `ai/guidelines/user-documentation.md`. They carry commands, flags, and verbatim messages, and leave out paths and module names.
- Prose follows `ai/guidelines/human-writing-guidelines.md`.
- Each spec states behavior as it is after subplan 25, never as a history of the series.
- `help/file.md` and the `file` row in `help/commands.md` already exist (subplan 5). The generated command reference page comes from them, so nothing under `documentation/user-documentation/command-reference/` is edited by hand.

## Proposed changes

- `product/specs/acp.md`, "Autonomous tool loop":
  - **Per-prompt snapshot.** The snapshot taken per prompt; the primer, allow-list, extraction, and gate reading it for the whole prompt; a mid-prompt settings change applying from the next prompt; the dispatcher's live guard still blocking the next caller-side run of a command disabled mid-prompt.
  - **Sides.** The caller and workspace sides, with `db`, `browser`, and `question` as caller tools and `file read` as a workspace tool.
  - **`file read`.** Its grammar, roots, containment and secret rules, limits, numbered output, continuation notice, empty-file text, every error and usage line, its primer slice, and its default grants.
  - **Tags.** The `[<host>] ` tag on remote workspace steps, on the transcript entry input and both record activity lines.
  - **Last sentence of the section.** It now says that caller tools stay on the machine running Janissary while workspace tools run where the workspace is.
  - **"Remote connections."** The loop runs on the far side: caller tools round-trip, cancellation aborts the far loop, and a transport loss settles the prompt with the existing error.
- `product/specs/remote-server.md`:
  - **Three-way split** (the "autonomous tool loop stays local" paragraph): the loop now runs on the far side, and only caller tools come back.
  - **Agent-run paragraph** (the "autonomous tool loop and granted Janissary command execution remain local" paragraph): the loop runs on the execution host, while command authorization for caller commands stays local.
  - **Protocol version 40 paragraph**, after the version 39 paragraph: `acp-run`, `acp-tool-result`, `acp-turn`, `acp-tool-request`, `acp-tool-step`, and `acp-run-end` in place of `acp-prompt` and `acp-end`; the `read-lines` operation; and why a version-39 peer is refused.
  - **Out-of-scope bullet** ("the tool loop stays local"): rewritten so only running `db`, `browser`, and `question` on the remote host stays out of scope.
- `product/specs/roles.md`: the default `ask` and `tell` grants include `file read`, and the count of native commands goes from nine to ten wherever it appears, including the "all nine native commands" sentences.
- `product/specs/agent-command.md`, the remote-execution paragraph:
  - an agent run on a remote host runs its loop there;
  - `janissary file read …` runs in the execution workspace when a skill grants `file`;
  - other granted commands still run and are authorized locally.
- `product/specs/application-commands.md`: the paragraph beginning "An ACP agent command is checked again immediately before every emitted call" becomes the per-prompt snapshot rule (source decisions 4 and 5).
  - **Kept:** the refusal texts and their order, the `command-disabled` notification, the missing-row rule, and the dispatcher's live guard for caller tools.
  - **Dropped:** "the next emitted command re-checks settings".
- `documentation/user-documentation/advanced-agents/acp-agent.md`:
  - the tool list (around "The agent can use the database, browser, and question tools") gains `file read`, with the default `ask` and `tell` grants;
  - the paragraph saying database, browser, and question act on the machine running Janissary gains where `file read` runs (the remote clone on a remote tab) and the host tag a remote step shows.
- `documentation/user-documentation/advanced-agents/remote-agents.md`:
  - "What stays local": caller tools stay local and `file read` reads the remote clone;
  - the agent-run paragraph that says "the autonomous tool loop stays on your machine": the loop runs on the remote host, and `db`, `browser`, and `question` still use your local app and files.

## Tests

None. `src/commands.test.ts` already covers the help page and table row from subplan 5.

## Out of scope

Any code change. New user pages; the edits stay in the existing ones.

## Verification

Run `$janissary/scripts/run.mjs check-diff`, then `npm run docs:build` to confirm the docs site builds with the generated `file` reference page. Re-read each edited section against the behavior verified in subplan 27.
