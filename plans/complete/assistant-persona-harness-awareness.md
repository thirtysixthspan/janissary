# Fix: the assistant monitor persona should summarize, not suggest, when a harness is doing the work

**Complexity: 1/10** — a wording change to one persona prompt file (`ai/personas/assistant.md`), guarded by a regression test that loads the real persona and asserts it now instructs harness-awareness. No code paths change.

## Goal

The `assistant` monitor persona currently always makes forward-looking suggestions ("point out the next step", "suggest a command"). When it is watching an AI coding **harness** — an agent already working autonomously — those suggestions are redundant: the harness will take its own next steps. In that case the persona should instead recognize the autonomous work and simply **summarize** what the AI has done, is doing, or is trying to do, rather than suggesting actions the harness will perform itself.

## Approach

Add a short paragraph to `ai/personas/assistant.md`'s body instructing the persona: when the watched tab is a harness working on its own, don't suggest actions it is already about to take — instead summarize what the AI has done / is doing / is trying to do. Keep the persona's existing voice (short, positive, no criticism) and leave its harness directive and tools lines untouched.

Because a persona body is an opaque prompt string with no runtime-testable semantics, the "behavior" that can be regression-guarded is that the real `assistant` persona still parses and now carries this instruction. Today the persona body contains no mention of harnesses, so a test asserting the loaded body mentions harness-awareness fails before the edit and passes after — a genuine red→green guard against the guidance being dropped by a future edit.

## Implementation steps

1. Edit `ai/personas/assistant.md`: add the harness-awareness paragraph to the body (directive/tools lines unchanged).
2. Add a test to `src/personas.test.ts` that `loadPersona('assistant')` (real project persona) parses (valid harness directive, non-empty body) and its body mentions harness-driven work (a stable keyword such as "harness").
3. Run `./scripts/run.mjs check-diff`.

## Tests (`src/personas.test.ts`)

- A new case loading the **real** `assistant` persona (default root): its harness directive parses, and its body includes harness-awareness guidance (e.g. contains "harness") — covering that the requested instruction is present and the file still loads.

## Out of scope

- Other personas — only the `assistant` persona is changed.
- The persona-parsing logic — unchanged; already covered by the existing synthetic-persona tests.
- Any change to how monitors deliver or format suggestions.

## Verification

- `./scripts/run.mjs check-diff` passes (the new persona test loads the real file and asserts the guidance).
- Manual: run an `assistant` monitor against a harness tab and observe that it summarizes the harness's work rather than suggesting steps the harness will take itself. Not runnable headless here (it needs a live ACP monitor session); the persona-load test covers the file-level change.
