# Correct the ACP guide's concurrent-prompt claim

**Complexity: 1/10** — a one-sentence prose correction in a single user-documentation page; no code or test changes.

The opening paragraph of `documentation/user-documentation/advanced-agents/acp-agent.md` says the shell
stays usable while a prompt runs, so other commands can run, "including another `acp` prompt". That
contradicts the page's own "One conversation per tab" section and the implementation: `AcpManager.run`
in `src/acp/manager.ts` refuses a prompt while `runtime.acpPrompt` is set with exactly
`ACP: a prompt is already running.`, and `src/commands/acp.test.ts` pins that refusal text. The earlier
sentence promises concurrent ACP work the app does not provide.

## Goal

The opening paragraph separates the two cases: ordinary non-ACP commands keep working while a prompt
runs, but a second `acp` prompt is refused with exactly `ACP: a prompt is already running.` and nothing
is queued. The rest of the paragraph — immediate return to the bar, the single settled Markdown answer,
the shell-output echo, and the absence of a response panel, responding status, or Reset ACP button —
stays as written.

## Approach

Edit only the opening paragraph of `documentation/user-documentation/advanced-agents/acp-agent.md`.
The later "One conversation per tab" section already states the refusal and needs no change. The
functional spec `product/specs/acp.md` already documents the refusal and the no-queue behavior, so it
also stays as written. No source, test, or help changes are required.

## Implementation steps

1. Rewrite the opening paragraph's "including another `acp` prompt" sentence to say ordinary non-ACP
   commands keep working while the prompt runs, while a second ACP prompt is refused with exactly
   `ACP: a prompt is already running.` and nothing is queued. Keep the settled-answer, no-panel, and
   retained-record text unchanged.

## Tests

None — this is a prose correction to user documentation, not a behavior change. Verification is
reading the rewritten paragraph against `documentation/user-documentation/advanced-agents/acp-agent.md`'s
"One conversation per tab" section, `src/acp/manager.ts`'s `runtime.acpPrompt` refusal, and
`src/commands/acp.test.ts`'s already-running case. The existing test suite needs no change.

## Out of scope

- `src/acp/manager.ts`, `src/commands/acp.test.ts`, and any other source or test file — the refusal
  behavior is already correct; only the guide's description of it was wrong.
- `product/specs/acp.md` — it already states the refusal and that nothing queues.
- Any other paragraph of the ACP guide, including the "One conversation per tab" section and the
  retained-record and connections text.
