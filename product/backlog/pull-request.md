<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request title, which labels the feature implementation as a documentation-only plan decomposition.

Existing Issue: The pull request title reads `docs(commands): decompose native command controls plan`, while the body and the diff implement native application command controls across server, client, and ACP code, so the title misstates the change a reviewer and a changelog will see. Severity: 3/10

Existing Risk: 3/10 - Conventional-commit tooling and release notes classify a feature as documentation, and a reader scanning history cannot find when the feature shipped.

Proposal Risk: 1/10 - The title matches the change; the body and the branch stay untouched.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1968 "retitle the pull request to match the feature implementation". Change the pull request title to a Conventional Commits feature title such as `feat(commands): add native application command controls`. Leave the body, the branch, and every file untouched; the body's Summary and How to verify sections already describe the shipped behavior. No source, test, plan, or documentation change is needed, and the existing title is the only stale metadata.
