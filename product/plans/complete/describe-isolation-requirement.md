# State in the pull request description that a comparison needs workspace isolation

**Complexity: 1/10** — one sentence in one section of the pull request's description. No code, no spec, no help.

## Goal

The description presents a comparison as one command away, and never says the feature only works on macOS.

It describes each member's process as "Seatbelt-confined to its own clone" and treats the isolation-off case only as something a member is refused for. But `confinableDir` in `src/multiagent/sessions.ts` refuses a member whenever `sandboxNotice` returns a reason, and `sandboxAvailable` is false on any platform without `/usr/bin/sandbox-exec`. So on Linux or Windows every member of every run reads `failed: workspace isolation unavailable`, and no comparison is ever produced — not a degraded one, none.

Refusing there is correct: an unconfined agent with every tool call approved is the one configuration the whole design exists to avoid. What is missing is that the consequence is a platform limit, and neither the description nor `help.md` says so. The spec does — `product/specs/multi-agent-tab.md` states the condition and that a member is refused with the reason rather than run — so this is the description catching up to the spec, not new information.

## Approach

Add one sentence to the **What** section, beside the paragraph that already explains why confinement is what makes the own-tools grant safe, since that is where a reader meets the dependency.

## Implementation steps

1. Read the current description body.
2. Add the sentence to the paragraph beginning "What makes that grant safe is confinement". It should agree with the spec's wording: a member is refused rather than connected whenever its process would not actually be confined — the isolation toggle off, or a host without `sandbox-exec` — so a comparison runs only where workspace isolation is available.
3. Write the whole revised body to a file and apply it with `gh pr edit --body-file`. Never pass `--title`.

## What must not change

Every other character of the description: **Behavior examples**, all fifteen **How to verify** steps, the **Additional test cases** section a test run appended and dated to the commit it tested, **Files changed**, and **Notes on scope**. The title is not touched at all.

## Tests

None. This is a sentence in a description, and the behavior it describes is already pinned by `src/multiagent/sessions.test.ts`, whose confinement cases assert that a member reporting isolation unavailable is not spawned and reads `failed` with the reason.

## Out of scope

- **Any behavior change.** The refusal is right; only its disclosure is thin.
- **A spec change.** `product/specs/multi-agent-tab.md` already records the condition.
- **The `help.md` row**, which describes what the command does rather than where it runs, and is a one-line quick reference beside twenty-nine others.

## Verification

Read the description back after the edit and confirm the sentence is present in **What**, that every other section is byte-for-byte what it was, and that the title is unchanged.
