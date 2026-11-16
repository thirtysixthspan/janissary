<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Cover the branch that unlinks a deleted symbolic link re-added as a regular file and then moved, whose behavior has no colocated test.

Existing Issue: The `replacedLink` flag in `src/file-patch/moves.ts` forces the move chain's `onDisk` value to false when a patch deletes a symbolic link, adds a regular file at the same path, and moves it, so the original link is unlinked and the new file is written at the destination; neither `src/file-patch/sections.test.ts` nor `src/file-patch/commit.test.ts` combines a delete-then-add of a link with a later move, so this state transition is verified only by reading the code. Severity: 4/10

Existing Risk: 3/10 - A future change to the flag or the on-disk condition can silently rename the original link and write through it, changing the link's target instead of placing the new file, and the wrong entry can be moved or overwritten with no test failing.

Proposal Risk: 1/10 - Two small cases pin the rows, change list, and committed tree, and no production code changes, so the behavior becomes regression-safe.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2011 "add coverage for the deleted-link re-added-then-moved branch". In src/file-patch/sections.test.ts, add a case with a `target` file and a `link` symbolic link to it: apply `*** Delete File: link`, `*** Add File: link` with `+new`, and `*** Update File: link` then `*** Move to: moved` against a temp root, then assert `result.changes.moves` is empty (the chain is on disk: false), `result.changes.deletes` holds the original link with `linkText: 'target'`, `result.changes.writes` holds `text: 'new\n'` at `moved`, and `result.rows` is exactly `[{ letter: 'D', path: 'link' }, { letter: 'A', path: 'moved' }]` in that order. In src/file-patch/commit.test.ts, commit the same patch and assert `moved` is a regular file containing `new\n`, `link` is gone, and `target` is unchanged; then run the same patch with an injected `writeFile` failure from `defaultCommitOperations` and assert the restore puts the original link back with `readlinkSync(link) === 'target'` and leaves `moved` absent. The existing handles links, shared content, and recreation case in sections.test.ts and the deletes, moves and updates links without replacing their targets case in commit.test.ts must keep passing untouched.
