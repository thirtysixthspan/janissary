<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Correct the pull request description's claim that every non-regular file reports `Not a text file`, which contradicts the `Is a directory` line the implementation returns for a directory.

Existing Issue: The description's `file read` paragraph says a missing or unreadable file reports `File not found` and that anything that is not a regular file reports `Not a text file`, while a directory — which is not a regular file — returns `Is a directory: <path>.`, as the description's own edge-case step 16 and the new `help/file.md` both state. Severity: 2/10

Existing Risk: 2/10 - A reader building a client or a test from the description expects `Not a text file` for a directory and gets `Is a directory`, so the stated contract fails the first time it is relied on.

Proposal Risk: 1/10 - The description and the implementation agree after the edit; the reader's behavior is unchanged and already correct.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1992 "correct the description's claim that every non-regular file reports Not a text file". In the pull request body's `file read` paragraph, replace the sentence that begins `A missing or unreadable file reports File not found; anything that is not a regular file reports Not a text file.` with wording that matches the plan's error table, `help/file.md`, and `src/file-read/read.ts`: a missing path, a dangling symlink, or a file that exists but cannot be read reports `File not found: <path>.`; a directory reports `Is a directory: <path>.`; and binary content, text that is not valid UTF-8, text containing a NUL byte, or anything else that is not a regular file or directory — a named pipe, socket, or device — reports `Not a text file: <path>.` Keep the existing statement that the path is named as typed. This is description-only: do not change `src/file-read/read.ts`, `src/file-read/read.test.ts`, `help/file.md`, or any other file, because those already implement, test, and document the distinction. Verify with `gh pr view 1992 --json body` that the paragraph now names all three lines and that edge-case step 16 still reads `Is a directory: notes.`; the directory cases in `src/file-read/read.test.ts` must keep passing untouched.
