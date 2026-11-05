# Bare OpenCode model heading specification

**Complexity: 1/10** — correct one inaccurate sentence in the Models specification and run the diff-scoped verification.

## Goal

Describe the existing Models tab heading for a bare OpenCode model id accurately.

## Approach

A bare id has no slash, so grouping uses the fallback prefix `opencode`. That is a known prefix and receives the `OpenCode Zen` heading. Update the sentence in the harness specification while preserving its description of first-appearance order, the other known headings, and raw headings for unlisted prefixes.

## Implementation steps

1. Correct the bare-id heading sentence in `product/specs/harness.md` to describe the fallback prefix and resulting `OpenCode Zen` heading.

## Tests

- Preserve the existing bare-model grouping assertion in `src/models/groups.test.ts`, which expects the `OpenCode Zen` heading.
- Run `./scripts/run.mjs check-diff` after the specification change.

## Out of scope

- Changing model grouping behavior or adding implementation and test code.
- Updating public documentation, which does not describe this Models tab detail.
