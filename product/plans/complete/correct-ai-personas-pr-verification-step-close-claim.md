# Correct the pull request verification step to drop the editor row Close claim

**Complexity: 1/10** — metadata-only description edit with no production files and no added lines, 3 acceptance requirements (p=2.56).

## Goal

Pull request 2185's `How to verify` step 3 tells a verifier they can close a core ACP session by running `connections close acp:<role>:<provider/model>` "or press the core row's Close control." The editor connections panel that the setup asks the verifier to open no longer supplies `onCloseRow` or `canCloseRow`, so none of its rows renders a close control. A verifier following that alternative looks for a control that isn't there and may conclude the feature is broken, or dismiss the session through an unrelated surface without realizing the panel is deliberately read-only. The goal is to correct that one verification step so it names only the command path and explains why no close control exists, without changing code, specs, or any other part of the description.

## Requirements

1. The `How to verify` step 3 "Do" line names only `connections close acp:<role>:<provider/model>` as the way to close the session. From the entry's Proposal: "Edit the pull request description's How to verify step 3 and Verification step 3 to describe closing through `connections close acp:<role>:<provider/model>` only". Reconnaissance found a single such step in the live body, under `### How to verify` → `Happy paths` → "3. Generic close".
2. Step 3 states that the editor connections window is read-only for core rows and cites the removal of `onCloseRow` and `canCloseRow` in `web/src/editor/EditorConnectionsPanel.tsx` and `web/src/editor/useEditorConnections.ts` as proof. From the entry's Proposal: "add a sentence stating that the editor connections window is read-only for core rows, pointing at the removal of onCloseRow and canCloseRow in web/src/editor/EditorConnectionsPanel.tsx and web/src/editor/useEditorConnections.ts as proof."
3. No other paragraph of the description, no source file, and no product spec changes. From the entry's Proposal: "Leave code and product specs unchanged; no behavior change is proposed." The orchestrator adds: "Change no other paragraph of the description."

## Design decisions

- Correct the description after the commit and push succeed, per the task's publication ordering, so the live description never describes work that is not yet on the branch.
- Read the live body with `gh pr view <reference> --json body`, write the full revised body to `./temp/pr-body.md`, and apply it with `gh pr edit <reference> --body-file ./temp/pr-body.md`; `gh pr edit` replaces the body wholesale, so preserving every other paragraph is the editor's job.
- Edit only the step 3 "Do" and "Expect" lines. No other heading, paragraph, step, or bullet is touched. Leave change-set statistics out; the corrected paragraph names no counts or SHAs.
- Leave the title untouched; it was already corrected to "feat: specify AI personas by role and route persona queries through the core ACP pipeline".
- Verify the claim before editing: both named files lack `onCloseRow` and `canCloseRow`, and commit `61024d13` "refactor(editor): drop per-persona connection plumbing" removed them from `EditorConnectionsPanel.tsx` and `useEditorConnections.ts`.
- Leave the pull request open; never merge, close, or replace it.

## Preserved behavior

None found. The change edits pull-request documentation only; no application behavior is touched.

## Assumptions

1. Pull request 2185 is OPEN with head branch `feat/ai-personas-role-acp-pipeline` — `gh pr view 2185 --json number,state,headRefName,url` returned `"state":"OPEN"`.
2. The live body has exactly one "press the core row's Close control" offer, in step 3 of `### How to verify` — `gh pr view 2185 --json body` and a grep of the extracted body found one match.
3. The editor connections panel is read-only for core rows: `web/src/editor/EditorConnectionsPanel.tsx` and `web/src/editor/useEditorConnections.ts` contain neither `onCloseRow` nor `canCloseRow`, and `git show 61024d13` shows both removed there.
4. The orchestrator authorizes this description correction despite the task's general description-edit safeguard, and forbids changing the title, code, product specs, and every other description paragraph.

## Existing functionality

1. `gh pr view <reference> --json body` reads the current description; `gh pr edit <reference> --body-file <path>` applies a full replacement from a file, which the task names as the safe route for multi-line markdown.
2. `./product/backlog/pull-request.md` records the entry and its `Proposal`, supplying the authorized wording and proof anchors.
3. Commit `61024d13` and the current contents of the two editor files provide the read-only proof the new sentence cites.

## Implementation steps

1. Record this fix plan under `./product/plans/` (draft, then rated, then ready, then complete); no application code is involved.
2. Remove the resolved entry whole from `./product/backlog/pull-request.md`, from its lead `*` bullet through its `Proposal` paragraph and separating blank lines, leaving the one remaining entry byte-for-byte unchanged and not restoring the comment-and-heading skeleton. Run `$janissary/scripts/run.mjs check-diff` after the edit; with only markdown changed it assembles an empty tool list and exits 0.
3. Commit the plan file and backlog removal to the recorded head branch with `$janissary/scripts/run.mjs pr-commit` and push with `git push`, leaving the pull request open.
4. After the push succeeds, read the current body with `gh pr view <reference> --json body`, write the full revised body to `./temp/pr-body.md` with only step 3 changed, and apply it with `gh pr edit <reference> --body-file ./temp/pr-body.md`.
5. Confirm the corrected body with `gh pr view <reference> --json body`, and confirm the pull request is still OPEN with a head matching `git rev-parse HEAD` using `gh pr view <reference> --json state,headRefName,headRefOid,url`.

## UI design

None. This is a pull-request description correction; it changes no command, flag, key binding, or user interface.

## Tests

No automated tests. The fix changes only pull-request documentation plus a plan file and a backlog entry; no application behavior is changed and no code is introduced, so there is nothing to test. The task forbids inventing tests that cover nothing.

## Out of scope

- Editing any source file, test, product spec, or help page.
- Changing the pull request title, already corrected.
- Changing any other paragraph of the description or any other pull-request metadata.
- Restoring the backlog skeleton — one entry remains after this one is removed.
- Merging, closing, or replacing pull request 2185.

## Verification

`$janissary/scripts/run.mjs check-diff` first — expected to run no tools and exit 0, since only markdown files changed.

Then, concrete read-based checks: `gh pr view <reference> --json body` must show step 3's "Do" line naming only `connections close acp:<role>:<provider/model>`, with no "Close control" wording anywhere in the body, and the new sentence stating the editor connections window is read-only for core rows and citing the two files. Every other paragraph must match the original body byte-for-byte. Read `./product/backlog/pull-request.md` and confirm the resolved entry is gone while the remaining one is byte-for-byte intact. Read this plan in `./product/plans/complete/` and confirm it records the description correction. Finally `gh pr view <reference> --json state,headRefName,headRefOid,url` must show state OPEN and a `headRefOid` equal to `git rev-parse HEAD`.
