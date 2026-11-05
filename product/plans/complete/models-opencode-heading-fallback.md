# OpenCode model heading fallback

**Complexity: 1/10** — an own-property check, three regression cases, and one concise spec update fix the raw-prefix fallback.

## Goal

Show every unlisted OpenCode provider prefix as its own string heading in the Models tab, including prefixes that match inherited object property names.

## Approach

`OPEN_CODE_HEADINGS` contains the four explicitly named provider labels. Read it only when the prefix is an own key; otherwise use the prefix itself. This preserves known labels and prevents inherited values such as `constructor`, `toString`, and `__proto__` from becoming group headings.

## Implementation steps

1. Update `appendOpenCodeGroups` in `src/models/groups.ts` to use `Object.hasOwn` before reading `OPEN_CODE_HEADINGS[prefix]`, falling back to `prefix` for every unlisted key.
2. Add `groupModelCatalog` cases in `src/models/groups.test.ts` for `constructor`, `toString`, and `__proto__`, asserting each resulting heading is exactly the prefix. Keep the existing known-heading and first-appearance ordering assertions.
3. Update `product/specs/harness.md` to state the OpenCode group heading names and raw-prefix fallback.

## Tests

- Each of the three prototype-named provider prefixes groups with a string heading equal to that prefix.
- Existing tests for the four known OpenCode headings, other unknown prefixes, and group first-appearance order remain green.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing provider labels, model ordering, refresh behavior, or the shape of catalog records.
- Implementing other Models tab UI or manager behavior.
