# Stop prescribing how to drive the app in the spec-testing task

**Complexity: 1/10** — one paragraph out of Step 5. No code, no test, no spec change.

`ai/tasks/research/find-bugs.md` spends a paragraph on the mechanics of exercising a product: drive a web app through the attached browser and read what is on screen; drive a tool with commands, flags, and stdin, and read stdout, stderr, exit status, and the files it wrote; drive an interactive one with a scratch pseudo-terminal that sends keystrokes; take `node-pty` from the project or the installation, or Python's `pty`, and install nothing; and where no pseudo-terminal is available, list the interactive behaviors under `Not tested` and carry on. That paragraph goes.

It is the last place the task told a reader *how* rather than *what*, after the browser connection mechanics, the worked example, and the product-specific error message came out. What the step still says is the part that is the task's own business: read each spec in full, derive a bounded checklist of the behavior it promises, and put the behavior under test through the browser or the tool rather than through reading the code. The forbidden list keeps the rule that the paragraph's "install nothing" restated — no pseudo-terminal library, no browser, nothing outside the lockfile.

One instruction is genuinely lost rather than relocated: what to do when a project has no pseudo-terminal mechanism available. There is no other home for it in this task, and none of the sibling tasks cover driving a terminal UI. A run that reaches an interactive behavior with nothing to drive it will fall back on its own judgment rather than on a rule.

## Implementation steps

1. `ai/tasks/research/find-bugs.md` — the paragraph in Step 5, between the checklist paragraph and the environment paragraph.

## Tests

None needed, and one that must keep passing: `scripts/find-bugs-playbook.test.mjs` pins the loopback address in the start task, the two browser variable names in this file and the guideline, the report shape, and the three delegations. None of them is in the removed text, so the suite is expected to pass untouched, and that is the check that the removal was confined to the paragraph named.

## Out of scope

- **The "install nothing" rule.** Forbidden item 3 already forbids installing a pseudo-terminal library or a browser, so the constraint the paragraph carried survives in the place that enforces it.
- **"The behavior under test must go through the browser or tool."** That sentence is in the paragraph above and is the requirement the whole task rests on: a bug found by reading code is not a bug found.
- **The environment paragraph** that follows, which says to exercise everything the spec promises and to report what stopped the rest. It is about scope, not about mechanics.
- **The evidence paragraph**, which says what to keep for a divergence and that captures stay in the scratch tree.
- **A replacement for the missing pseudo-terminal fallback.** Adding one would be new guidance rather than a removal, and no sibling task has a natural home for it.

## Verification

Automated: `./scripts/run.mjs check-diff`.

Manual: search the task for `node-pty`, `pty`, and `stdin` and confirm none is left, and confirm the sentence requiring the behavior under test to go through the browser or the tool is still there.
