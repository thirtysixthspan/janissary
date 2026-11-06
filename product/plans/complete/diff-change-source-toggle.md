# Diff tab change-source toggle

Issue: add an icon button in the metadata row that alternates between - all changes in the repo, staged changes, changes associated with the most recent commit.

Complexity: 5/10

## Goal

The diff tab always shows the working tree against `HEAD` (staged, unstaged, and untracked together). Add an icon button in the diff tab's metadata row that cycles the tab through three change sources: **all changes** (today's view), **staged changes** (the index against `HEAD`), and **last commit** (the most recent commit against its first parent). It works the same way on local and remote workspace diffs.

## Approach

- `src/plugins/diff/shared.ts`: a `DiffSource` union (`all | staged | commit`), the `DIFF_SOURCES` order, an `isDiffSource` guard, a required `source` field on `DiffPayload`, and a `SourceIntent` with its guard. Bump `DIFF_PAYLOAD_SCHEMA_VERSION` to 10 because the payload gained a required field, and the matching literal in `web/src/plugins/registry.tsx`.
- New `src/plugins/diff/source-range.ts`: turns a source into the `git diff` revision arguments it compares — `--cached` for staged (also valid before the first commit), `HEAD` for all, `HEAD^ HEAD` for the last commit, or the empty tree against `HEAD` when that commit has no parent. Answers null when `HEAD` does not resolve and the source needs it. Absorbs the `hasHead` check from `change-set.ts`.
- `src/plugins/diff/change-set.ts`: `readChangeSet` takes a `source` (default `all`), diffs the range `sourceRange` answers, reads untracked files only for `all`, keeps the unborn-repository route for `all`, and answers an empty change set for `commit` with no commits.
- `src/plugins/diff/context-diff.ts`: full-file expansion diffs the same range rather than a hardcoded `HEAD`.
- `src/plugins/diff/tab-state.ts`: the tab keeps its source in the payload, passes it to every read, and a `setSource` that, when the source changes, clears expansions, cancels the read in flight, clears the body to loading, and recomputes — the same treatment a re-scope gets. A newly built tab starts at `all`.
- `src/plugins/diff/session.ts` and `activate.ts`: a `source` intent routed to the tab by instance key. The source is per tab and not saved; unlike the layout it is a question about one tab's changes, not a standing preference.
- Remote: `readRemoteChangeSet` and the `readWorkspaceChangeSet` plugin capability take an optional source (an additive capability change, so the tab plugin API version stays 3). The `change-set` remote filesystem operation carries a required `source`; its descriptor moves to its own `change-set-operation.ts` (beside `search-text-operation.ts`) so `operations.ts` stays under the line limit. `FileSystemPort.changeSet` and both ports pass it through. Bump `REMOTE_PROTOCOL_VERSION` to 38: a version-37 peer would ignore the field and silently answer with all changes.
- Web: new `web/src/plugins/diff/SourceControl.tsx` renders the button in the header's action group, beside the layout toggle — a distinct Font Awesome icon per source (layer group for all, list check for staged, code commit for last commit), an `aria-label` of "Change source", and a tooltip naming the current source and the one a click switches to. `DiffTab` sends the `source` intent with the next source in order, and file entries are keyed by source as well so a switch starts every entry over.

## Implementation steps

1. Shared types and guards in `shared.ts`, schema bump.
2. `source-range.ts`, then `change-set.ts` and `context-diff.ts` reading by source.
3. Tab state, session, and activation intent.
4. Remote: capability signature, remote reader, port interface and both ports, the extracted operation descriptor, frame args, protocol version.
5. Web: `SourceControl` and `DiffTab` wiring.

## Tests

- `src/plugins/diff/change-set.test.ts`: staged reads only the index (an unstaged edit and an untracked file are left out); last commit reads only that commit's files; the first commit reads as all added; last commit before any commit answers no changes; staged before any commit reads the staged files as added; full-file expansion follows the source.
- `src/plugins/diff/shared` guard coverage: `isDiffSource`, `isSourceIntent`, and the payload guard refusing a missing or unknown source (in an existing diff test file).
- `src/plugins/diff/tab-state.test.ts`: setting the source re-reads with it and publishes the new source with a loading, empty body; setting the same source does nothing.
- `src/plugins/diff/activate.test.ts`: the `source` intent reaches the tab's reader.
- `src/plugins/diff/remote-change-set.test.ts`: the source is passed to `readWorkspaceChangeSet`.
- `src/remote/filesystem/operations.test.ts` and `src/remote/serve-file-navigator.test.ts`: `change-set` args carry and validate `source`; `src/remote/protocol.test.ts` pins version 38.
- `web/src/plugins/diff/DiffTab.test.tsx`: the button cycles all → staged → last commit → all through the `source` intent, and its tooltip and icon follow the payload's source.

## Out of scope

- Persisting the chosen source across tabs or restarts.
- Choosing an arbitrary commit or range; only the most recent commit.
- Opening a file from a staged or committed view opens the working-tree file at the reported line, as today; the editor does not show the index or committed version.

## Specs / docs

`product/specs/diff-tab.md`: the opening paragraph, the recompute paragraph, a new "Change source" subsection, and the comment and lifetime sentences. `product/specs/remote-server.md`: the change-set request paragraph and a protocol version 38 paragraph. `documentation/user-documentation/tab-types/diff-tab.md` and `diff.md`, which describe what the tab shows and its header controls. `help/` describes only the command, which is unchanged.
