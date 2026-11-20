# Complete bare-final-line documentation removal

**Complexity: 1/10** — prose-only documentation sweep: no production code, tests, new modules, or behavioral requirements, and no file-size pressure (p=1.578).

## Goal

The labelled-block repair replaced the bare-final-line extractor with one that reads exactly one command from a final fenced block whose info string is exactly `janissary`, but several narrative sentences in the functional specs and agent user-documentation still teach the removed rule — that an agent issues a command by ending its reply with a bare final line. A prior repair promised a complete sweep and missed these narratives. They must be rewritten so every spec and agent user doc agrees with the shipped extractor, or a reader can follow the stale rule, see the reply end as a final answer with no command run, and conclude the feature is broken.

## Approach

Rewrite only the named narrative sentences, reusing the labelled-block wording already pinned in `product/specs/acp.md`'s loop, tool-table, Web search, and Web fetch paragraphs and in the runtime primers: the command goes in a final `janissary` fenced block, a bare final line outside the block is prose that ends the turn, and a malformed command inside the block is gated and answered with its usage line. Keep each page's other paragraphs, quoted primers, images, links, grants, refusals, and case-sensitivity notes byte-for-byte. Change no behavior, source, primer constant, or test: `src/acp/command-block.test.ts` and the per-tool primer tests already pin the real rule. Then sweep both trees for every bare-final-line phrasing and confirm no narrative issuing a command by a final bare line remains on the ACP or agent command path.

## Implementation steps

1. In `product/specs/acp.md`, rewrite the mutation-primer sentence in the "File write and edit tools" paragraph that says the primer tells the agent to end its reply with one `file write {...}` or `file edit {...}` line whose JSON stays on that line, so it says the primer tells the agent to put exactly one such command inside a final fenced block whose info string is exactly `janissary`. Keep the JSON-escaping, worked-example, reply-name, `expectedHash`, and allow-list sentences intact.

2. In `product/specs/acp.md`, rewrite the next paragraph's claim that the reply's last `file write` or `file edit` line is recognized as a command even when its JSON is incomplete, so it says a malformed command inside the labelled block is gated and answered with the usage line while a bare final line outside the block is prose that ends the turn. Keep the gate, step-count, `withoutTools`, and follow-up-prompt sentences intact.

3. In `product/specs/notifications.md`, rewrite the native ACP notify sentence in the `notify <message>` section that says an ask or tell agent can end a reply with one `notify <message>` line and that a bare line returns the usage error, so it says the command goes in a final `janissary` block, a bare final line is prose that ends the turn, and a malformed command in the block returns usage as a tool result. Keep the typed-command, attribution, grant, default-role, and migration sentences intact.

4. In `documentation/user-documentation/advanced-agents/acp-agent.md`, rewrite the web search paragraph that says the agent ends its reply with one lowercase `web search …` line and that a bare line answers with usage, and the web fetch paragraph that says the agent ends its reply with one lowercase `web fetch …` line and that a bare line answers with usage, so both teach the labelled block while keeping the lowercase-only/case-sensitivity sentences, the disabled/agent-off refusal rows, and the grant sentences.

5. In `documentation/user-documentation/advanced-agents/agent-questions.md`, rewrite the sentence saying an agent ends its reply with one of the question commands, so it says the agent puts the command in a final `janissary` block. Keep the strip/hold/result sentence and the malformed-command usage sentence intact.

6. Sweep the entire `product/specs/` and `documentation/user-documentation/` trees for "end your reply with one line", "own final line", "own final response line", "ends its reply with", "final nonempty reply line", "bare line", "A bare", "last such line", "one lowercase", and "`janissary <command>`". Read every hit and rewrite any remaining narrative that describes issuing a command by a final bare line for the ACP or agent command path, leaving typed-command usage, already-correct labelled-block wording, and unrelated UI text untouched. Run `$janissary/scripts/run.mjs check-diff` and keep the full server suite green.

## Tests

No new tests: the change is documentation only. Confirm `src/acp/command-block.ts`, `src/acp/loop.ts`, every primer constant, and every test remain untouched, and that `$janissary/scripts/run.mjs check-diff` reports a green full server suite.

## Spec and documentation

Update `product/specs/acp.md`, `product/specs/notifications.md`, `documentation/user-documentation/advanced-agents/acp-agent.md`, and `documentation/user-documentation/advanced-agents/agent-questions.md` as described above. No help pages need editing.

## Out of scope

Changing any source, test, behavior, primer constant, PR description, or spec/doc sentence not named above; adding new documentation; merging or closing the PR.
