<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the Models spec's OpenCode heading behavior accurately for bare model IDs.

Existing Issue: `product/specs/harness.md` says a bare OpenCode id uses the raw heading `opencode`, but `openCodePrefix` maps a bare id to the known `opencode` prefix whose heading is `OpenCode Zen`, as the existing grouping test confirms. Severity: 3/10

Existing Risk: 2/10 - A reader implementing or changing the Models tab from the spec can use a heading that disagrees with the shipped grouping behavior.

Proposal Risk: 1/10 - The spec states the actual bare-id mapping, while the existing grouping assertion continues to guard the rendered heading.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1935 "document bare OpenCode ids under the Zen heading". Correct the bare-id sentence in `product/specs/harness.md` to say that a bare OpenCode id uses the fallback `opencode` prefix and therefore receives the known `OpenCode Zen` heading. Keep the surrounding description of first-appearance order, known provider labels, and raw headings for unlisted prefixes. The existing bare-model case in `src/models/groups.test.ts` already asserts that the `bare-model` record is grouped under `OpenCode Zen`; preserve that coverage and run `./scripts/run.mjs check-diff` for the spec-only change.
