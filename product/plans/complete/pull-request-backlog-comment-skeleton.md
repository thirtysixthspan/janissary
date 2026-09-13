# Keep an empty pull-request backlog as a comment-preserving skeleton

**Complexity: 3/10** — one new markdown backlog file and prose edits to two AI task documents and one spec. No source code, no tests.

## Goal

`product/backlog/pull-request.md` becomes a file that exists on master, leading with a comment that explains what the file is for (maintaining work items tied to an open pull request) and that it should otherwise be empty on master. When the review backlog on a pull request branch is drained, the file is no longer deleted: it is restored to its leading-comment skeleton, byte-for-byte matching master. The pull-request-review spec stops saying the backlog is removed when empty.

## Background

Today `product/backlog/pull-request.md` is created on demand by `ai/tasks/pull-request-review.md` with a bare `# pull-request` heading and deleted again by `ai/tasks/work-an-issue.md` (`git rm`) once its last entry is resolved. The issues backlog entry asks for the file to always exist on master with a leading comment, and for the consumer task to keep the file when empty rather than removing it.

Making the file always present on master has a second benefit: a pull request branch inherits the skeleton, so restoring it on drain leaves no diff for the file when the branch merges back — the file only ever differs from master by uncommitted-away entries or an in-flux skeleton.

Decisions:

1. **The master skeleton is the heading plus a leading paragraph comment.** HTML-comment form, matching how markdown files can carry guidance that is not part of the entry stream. The comment states the file is for maintaining work items tied to a pull request and should otherwise be empty on master.
2. **Draining restores the skeleton, it does not delete the file.** When no entry remains, the branch's file is rewritten to the master skeleton byte-for-byte. This replaces the `git rm` rule. Compared against a head branch's original state (inherited from master) this means a fully drained branch (all entries resolved) has no diff for this file — clean.
3. **Scope expansion, declared up front.** The issue names only `work-an-issue.md`, but two documents carry the now-false "file is deleted when empty" statement: one sentence in `ai/tasks/pull-request-review.md` (the "no status sections, deliberately" paragraph) and one sentence in `product/specs/pull-request-review.md` (the review backlog section). The plan includes editing both to keep the three documents agreeing.
4. **The review task's create-when-missing skeleton gains the comment too.** Since master carries the file, a branch nearly always inherits it — but if the file is missing (a branch cut before the skeleton landed), creating it should write the same heading-plus-comment skeleton so autonomy between the documents holds and creations converge on one shape.

## Implementation

### 1. Create `product/backlog/pull-request.md` on master

Contents exactly:

```
<!-- This file records work items tied to an open pull request and lives on the pull request's own branch. Entries are maintained while the pull request is open and it should be empty on master, holding no more than this comment and the heading. -->

# pull-request
```

Wait — the issue says the file "leads with a comment". The comment is the leading content. Order: comment first, then the `# pull-request` heading (the heading is the anchor the tasks reference). Keep the natural order: comment, then heading. Final contents:

```
<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request
```

Note: `ai/tasks/work-an-issue.md` Step 1 says a backlog "with no entries under its `# pull-request` heading" means no recorded work. A file with only the comment and heading satisfies "no entries" — comment placement above the heading is the deliberate reference: an empty master file is indistinguishable from a drained branch file, and both mean "no recorded work".

### 2. Update `ai/tasks/work-an-issue.md`

- **Opening paragraph (line 3).** Nothing says the file is removed when drained there — the second sentence says "the completed entry is removed from it". Fine as written; the drain sentence lives in the PR-mode paragraph.
- **PR-mode paragraph (line 15).** Replace "When the fix is done, remove the resolved entry from that backlog; when no entry remains in it at all, remove the file from the branch as well." with "When the fix is done, remove the resolved entry from that backlog; when no entry remains, the file stays — the branch's copy is rewritten to the master skeleton, the leading comment plus the `# pull-request` heading, byte-for-byte, which the branch inherited anyway."
- **Allowed list (line 29).** Replace "and remove the file itself once it holds no entries at all" with "and, once it holds no entries at all, rewrite the branch's copy to the master skeleton — the leading comment plus the `# pull-request` heading."
- **Forbidden rule 10 (line 42).** Retitle and rewrite. Old rule forbids deleting the file while entries remain. New rule: **Deleting `product/backlog/pull-request.md` at all is forbidden**, in every state. The file is on master with a leading comment; when the backlog drains, the branch's copy returns to that skeleton instead of being removed. An entry still sitting in it is work still on the record — deletion would erase it either way.
- **Step 7, sub-step 2 (lines 147–149).** The drained-state sentence: replace "If none remains, the backlog is drained: remove the file with `git rm ...`" — including the justification sentences about "a bare heading is not a state this file has" and "Use `git rm` rather than a plain `rm`" — with "If none remains, the backlog is drained: rewrite the file to the master skeleton — the leading comment and the `# pull-request` heading, nothing more — matching master's copy byte-for-byte. Do not `git rm` or otherwise delete the file."
- **Step 9 report (line 203).** Replace the `drained — file removed from the branch` variant with `drained — file restored to its comment-and-heading skeleton`.

### 3. Update `ai/tasks/pull-request-review.md`

- **Line 108, the "no status sections, deliberately" paragraph.** Replace "and is deleted from the branch the moment it empties" with "and returns to its comment-and-heading skeleton — the form `master` carries — the moment it empties."
- **Line 106, the create-when-missing skeleton.** Since master now carries the file, this is almost never exercised — the branch inherits it. Keep the paragraph but state the skeleton is the master form: a leading comment naming what the file is for, then the `# pull-request` heading. If the file is somehow missing on the branch, create it with that exact skeleton.
- **Line 108, "do not drain/deletion claim" in the entry list verification** — step 4/5 does not name deletion. Untouched.

### 4. Update `product/specs/pull-request-review.md`

Rewrite the closing sentence of "### The review backlog" (line 9). "An entry leaves the list when it is resolved or when someone decides against it, since deleting an entry is how a finding is declined. Once the last entry goes, the backlog itself is removed from the branch." — becomes: "An entry leaves the list when it is resolved or when someone decides against it, since deleting an entry is how a finding is declined. Once the last entry goes, the backlog returns to its empty form — the leading comment and heading it carries on master — rather than being removed from the branch."

## Tests

No code tests. This is markdown prose and one new markdown file. `check-diff` will confirm nothing in src/web regressed (it should be a no-op — no source changed).

Verification is manual reading:

- `product/backlog/pull-request.md` exists with the comment leading, the `# pull-request` heading after it, no entries.
- `ai/tasks/work-an-issue.md`, `ai/tasks/pull-request-review.md`, and `product/specs/pull-request-review.md` show no contradiction: all three describe the drained state as "backlog restored to the skeleton" with no remaining "file removed" text. Grep the three files for `git rm`, "remove the file", and "backlog itself is removed" to confirm none survive where they describe the drained state.

## Out of scope

- Any edit to `src/` or `web/src/` — `scaffoldProject` and `BACKLOG_FILES` are unchanged (the pull-request backlog is not a scaffolded backlog file; that decision from `pull-request-backlog-without-sections.md` stands).
- Any change to how entries themselves are formatted or drained (the five-part structure, whole-entry removal, byte-for-byte untouched siblings).
- The issues file's own sections or positioning — the only edit allowed there is removing the resolved issue line.
- Public docs: `help.md` and `documentation/user-documentation/` do not document the pull-request backlog, so nothing changes there.
