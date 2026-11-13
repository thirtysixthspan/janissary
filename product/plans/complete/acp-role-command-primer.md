# Give ACP role sessions a complete primer for their granted commands

**Complexity: 4/10** — 7 requirements and 7 test scenarios across ~25 added lines in 2 existing files plus one small new module (p=5.02)

## Goal

An ACP role session (`ask` / `tell`, or a plugin tab's core session) learns from its first prompt everything it needs to drive the commands its role grants without help from the user: each command's full signature and parameter format, and the exchange protocol over the ACP channel — how to emit a command, how its output comes back, what a refusal looks like, how many commands a request may run, and how to finish. The backlog example is the acceptance test: a fresh `tell` agent should be able to write text content to a new file on its own.

Today the core primer (`corePrimer` in `src/acp/drive-loop.ts`) concatenates per-owner group primers from `src/acp/tool-table.ts`, then the allow-list line and the tool-availability line. The exchange protocol is only partly stated, and only inside some group primers: the database, browser, and question primers say "end your reply with exactly one … command on its own final line (no code fence, nothing after it)" and "reply with the final answer and NO trailing command", but the file read and file write/edit primers say neither, no primer says how output is returned, that a refused command comes back as a tool result, or that a request may run at most `CORE_MAX_STEPS` (8) commands. The file write/edit primer gives the JSON shapes but no worked example, no guidance on escaping quotes and backslashes in the JSON string, and no description of the success replies — the exact gaps that make writing a new multi-line file unreliable for a new agent.

## Approach

1. Add one shared exchange-protocol section, stated once for every role session that has at least one available command, rather than repeating (and partially omitting) it in each group primer. It lives in a new module `src/acp/command-protocol.ts` as a pure function `commandProtocolPrimer(maxSteps)` so the step cap it states is the same constant the loop enforces. Text:

   ```
   How commands work:
   - To run a command, end your reply with exactly one command on its own final line, as plain text: no code fence, no prompt marker, nothing after it. One command runs per reply.
   - The host runs it and sends the result back as your next message, starting with "Output of" and the command. Read it, then issue the next command or give the final answer.
   - A command that is not allowed or is disabled returns its refusal as that output; do not retry it.
   - At most <maxSteps> commands run for one request. When the task is done, reply with the final answer and no trailing command.
   ```

2. `corePrimer` inserts that section right after the `You have no built-in tools; use only the commands listed here.` line and before the tell instruction, only when that line is used (at least one tool and one available command). A session with no available command keeps `You have no tools; answer in prose.` and gets no protocol section. Ordering of every existing piece is unchanged.

3. Complete `FILE_MUTATION_PRIMER` in `src/file-write/command.ts` with three lines after the existing six:
   - escaping: `Inside JSON strings escape " as \" and \ as \\.`
   - a worked new-file example: `Example, creating notes/todo.md: file write {"path":"notes/todo.md","content":"# Todo\n- first item\n"}`
   - the replies: `A write answers "Wrote <path>."; an edit answers "Edited <path> (<n> replacements)."`

   It still never mentions `expectedHash`.

Rejected alternative: filtering each group primer down to only the granted subcommands. The spec deliberately keeps a granted owner's whole group primer (a disabled or ungranted command stays recognizable so it is refused as a tool result instead of becoming a final answer), and the allow-list line already names exactly what may run.

## Implementation steps

1. Create `src/acp/command-protocol.ts` exporting `commandProtocolPrimer(maxSteps: number): string`.
2. In `src/acp/drive-loop.ts`, call it with `CORE_MAX_STEPS` from `corePrimer` when tools are available. Move `CORE_MAX_STEPS` above `corePrimer` so it is defined before use.
3. Extend `FILE_MUTATION_PRIMER` in `src/file-write/command.ts`.
4. Update the colocated tests that pin exact primer text.

## Tests

- `src/acp/command-protocol.test.ts` (new): the section names the step cap it is given, states the final-line plain-text rule, the "Output of" reply, the refusal-as-output rule, and finishing with no command.
- `src/acp/drive-loop.test.ts`: the full primer for a tool-bearing role is the group primers, allow-list line, no-built-in-tools line, protocol section (with 8), then the Markdown instruction; a no-tools primer contains no protocol section.
- `src/acp/run-prompt.test.ts`: exact-equality expectations for tool-bearing primers include the protocol section between the no-built-in-tools line and the tell instruction; the existing ordering assertion extends to the protocol section; the browser-only no-available-command primer has no protocol section.
- `src/file-write/command.test.ts`: the mutation primer contains the escaping rule, the `file write` example creating `notes/todo.md`, both reply forms, still no `expectedHash`, and is nine lines.

## Spec and docs

- `product/specs/acp.md`: describe the protocol section, where it sits, and when it is omitted; describe the mutation primer's example, escaping rule, and replies.
- `help/` and `documentation/user-documentation/` do not describe primer text; no change expected.

## Out of scope

- Rewording or de-duplicating the protocol sentences inside the existing database, browser, and question group primers.
- Agent-run (`agent` command) primers, which use native harness tools and a different protocol.
- Changing the file read primer, which the spec pins verbatim and which is already complete.
