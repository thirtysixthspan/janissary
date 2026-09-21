# Shorten the detach confirmation

**Complexity: 1/10**

## Goal

Remove redundant consequence text from the remote detach confirmation.

## Approach

Use the direct question already naming the host.

## Tests

- `web/src/shared/AgentTabMeta.test.tsx` — updates the confirmation text expectation.

## Spec updates

- `product/specs/sessions-tab.md` — records the concise question.

## Docs

- None needed.

## Out of scope

- Detach behavior.
