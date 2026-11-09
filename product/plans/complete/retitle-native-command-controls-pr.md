# Retitle the pull request to match the feature implementation

**Complexity: 1/10** — a metadata correction on the pull request. No source, test, or documentation change.

The pull request title read `docs(commands): decompose native command controls plan`, while the branch implements native application command controls across server, client, and ACP code.

## Goal

The title classifies the change as a feature so history and release notes find it.

## Approach

1. Change the title to `feat(commands): add native application command controls`.
2. Leave the body, the branch, and every file untouched.

## Tests

None; there is no behavior change.

## Specs

None.

## Out of scope

Any change to the pull request body.
