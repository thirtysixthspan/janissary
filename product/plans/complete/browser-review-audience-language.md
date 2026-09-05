# Describe browser verification audiences without reviewer commands

**Complexity: 2/10** - this is a tightly scoped documentation rewrite with no product behavior or code changes.

## Issue

The browser operating guide, completed feature plan, and pull request verification section address automated reviewers directly and make claims about what task or instruction takes precedence. Because these documents are themselves branch material under review, that language creates an inappropriate branch-authored instruction channel.

## Approach

Describe each document's intended audience and purpose in third person. Preserve the operational and verification examples as claims a human can evaluate, while removing direct addresses to reviewers, commands about what reviewers may execute or avoid, and assertions that determine instruction priority.

## Implementation

1. Replace the operating guide's defensive reviewer paragraphs with a concise third-person audience description for an installed runtime guide.
2. Rewrite the completed feature plan's verification audience note as a historical description of the recorded bring-up procedure.
3. Rewrite PR #975's `How to verify` introduction as a description of the evidence and host requirements.
4. Search the affected material for remaining direct reviewer language and remove only this resolved backlog entry.

## Tests

Inspect the final diff and search the affected documents for direct addresses to automated reviewers, reviewer authority claims, and task-precedence language. Run `./scripts/run.mjs check-diff` to validate repository formatting and tests.

## Documentation

This issue is entirely documentation. It updates the runtime guide, the completed feature plan, and the existing pull request description without changing their operational examples.

## Out of scope

- Rewriting the operational procedures themselves.
- Changing browser or sandbox behavior.
- Removing ordinary imperative language intended for the installed runtime guide's declared audience.

## Verification result

The installed guide now describes its runtime audience in third person, the completed plan identifies its commands as a historical verification record, and the PR introduction describes reproducible evidence for a human maintainer. Searches of all three affected materials find no remaining references to automated reviewers, commands addressed to reviewers, authorization claims, or task-precedence language. `./scripts/run.mjs check-diff` has no code checks to select for this documentation-only diff.
