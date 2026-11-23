# Correct the pull request title to describe the delivered feature

**Complexity: 1/10** — metadata-only title edit with no production files and no added lines, 3 acceptance requirements (p=2.56).

## Goal

Pull request 2185 is titled "docs: publish the ai-personas role and ACP pipeline plans", but its diff implements the persona-format and ACP-pipeline feature across source, tests and specs, with the plan only moved from ready to complete. A reviewer filtering by change type, or release tooling treating the `docs` prefix as authoritative, would classify a behavior-changing feature as documentation and ship it without the scrutiny a feature change gets. The goal is to retitle the pull request so its Conventional Commit type and subject agree with the feature already described in its body, changing only that metadata.

## Requirements

1. The pull request title uses the `feat` Conventional Commit type. From the entry's Proposal: "Retitle the pull request with a `feat` conventional-commit type that names the delivered behavior".
2. The new title names the delivered behavior. From the entry's Proposal: "for example 'feat: specify AI personas by role and route persona queries through the core ACP pipeline', so the title agrees with the feature description already in the pull request body." The orchestrator authorizes exactly that string for this entry.
3. The pull request body, description, and all other metadata stay unchanged. From the entry's Proposal: "Do not change the description text or any source file in this work item." The orchestrator further forbids changing the body, any source file, or any other pull-request metadata.

## Design decisions

- Apply the title change after the commit and push succeed, following the task's publication ordering, so a live GitHub artifact is never ahead of the content on its branch.
- Use `gh pr edit 2185 --title` with the title flag only; never pass `--body`, because `gh pr edit` replaces metadata wholesale and the body must stay byte-for-byte as the author wrote it.
- Use the exact authorized replacement string, "feat: specify AI personas by role and route persona queries through the core ACP pipeline", and nothing else.
- Confirm the live result with `gh pr view 2185 --json title`, and confirm afterward that the pull request is still OPEN and its head still matches the local HEAD.
- Leave the pull request open; never merge, close, or replace it.

## Preserved behavior

None found.

## Assumptions

1. Pull request 2185 is OPEN with head branch `feat/ai-personas-role-acp-pipeline` — `gh pr view 2185 --json number,state,headRefName,url` returned `"state":"OPEN"`.
2. The current title is "docs: publish the ai-personas role and ACP pipeline plans" — `gh pr view 2185 --json title`.
3. The body already describes a feature — `gh pr view 2185 --json body` opens with "Specify AI personas by role and move persona queries onto the core ACP pipeline", so the `docs` prefix is the mismatch.
4. The orchestrator explicitly authorizes this single title edit despite the task's general no-title-edit safeguard; no other metadata, source file, or description text may change.

## Existing functionality

1. `gh pr edit <reference> --title <text>` is the GitHub CLI route for changing a pull request's title without supplying a body; the task normally forbids it, but the orchestrator authorizes it for this entry.
2. `gh pr view <reference> --json title` reads back the live title, using the same CLI the task already relies on for state checks.
3. The backlog entry and its `Proposal` in `./product/backlog/pull-request.md` supply the authorized replacement title string.

## Implementation steps

1. Record this fix plan under `./product/plans/` (draft, then ready, then complete) with its complexity line; no application code is involved.
2. Remove the resolved entry whole from `./product/backlog/pull-request.md`, from its lead `*` bullet through its `Proposal` paragraph and separating blank lines, leaving the other two entries byte-for-byte unchanged. Run `$janissary/scripts/run.mjs check-diff` after the edit; with only markdown changed it assembles an empty tool list and exits 0.
3. Commit the plan file and backlog removal to the recorded head branch with `$janissary/scripts/run.mjs pr-commit` and push with `git push`, leaving the pull request open.
4. After the push succeeds, apply the title with `gh pr edit 2185 --title "feat: specify AI personas by role and route persona queries through the core ACP pipeline"`, passing no `--body` flag.
5. Confirm the new title with `gh pr view 2185 --json title`, and confirm the pull request is still OPEN with a head matching `git rev-parse HEAD` using `gh pr view 2185 --json state,headRefName,headRefOid,url`.

## UI design

None. This is a pull-request metadata correction; it changes no command, flag, key binding, or user interface.

## Tests

No automated tests. The fix changes only pull-request metadata plus a plan file and a backlog entry; no application behavior is changed and no code is introduced, so there is nothing to test. The task forbids inventing tests that cover nothing.

## Out of scope

- Editing the pull request body or description; it must remain byte-for-byte as the author wrote it.
- Editing any source file, spec, or help page.
- Changing any other pull-request metadata, such as labels or reviewers.
- Changing the other two backlog entries or restoring the backlog skeleton — two entries remain after this one is removed.
- Merging, closing, or replacing pull request 2185.

## Verification

`$janissary/scripts/run.mjs check-diff` first — expected to run no tools and exit 0, since only markdown files changed.

Then, concrete read-based checks: `gh pr view 2185 --json title` must return "feat: specify AI personas by role and route persona queries through the core ACP pipeline". `gh pr view 2185 --json body` must still return the original description text, unchanged. Read `./product/backlog/pull-request.md` and confirm the first entry is gone while the other two entries are byte-for-byte intact. Read this plan in `./product/plans/complete/` and confirm it states the title now uses a `feat` Conventional Commit type describing the delivered feature. Finally `gh pr view 2185 --json state,headRefName,headRefOid,url` must show state OPEN and a `headRefOid` equal to `git rev-parse HEAD`.
