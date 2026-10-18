<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Pin with a test and a comment that an admitted runscript tick never rewrites the Git exclusion, since the refresh's cost depends on that (technical debt).

Existing Issue: The admitted-tab tick reads names through the listing function, which writes nothing, but no new test reads the Git exclusion file on that path, and the rows module carries no comment explaining why it avoids the catalog function that rewrites the exclusion on every call. Severity: 4/10

Existing Risk: 4/10 - A well-meant change to the catalog function in the rows module would rewrite the repository's exclusion file once a second while a scripts tab is open, and nothing in the suite would flag it on a normal admitted tick.

Proposal Risk: 2/10 - With the exclusion file pinned across admitted ticks and the reason written beside the listing call, a regression fails the suite and a reader meets the reason in the code rather than only in a plan that has moved to the completed folder.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "pin the admitted tick's no-exclusion-write behavior". In `src/schedule/system/runscript-refresh.test.ts`, add a case in the admitted-tab section that makes a real Git repository in the temporary project with `execFileSync('git', ['init', '-q'], { cwd: root })`, the pattern `src/schedule/system/runscript-files.test.ts` already uses, writes one runscript into the scripts directory, reads the repository's `.git/info/exclude` text, runs an admitted tick with a plugin tab whose id the `listens` predicate accepts, and asserts that the exclusion text is unchanged and that the runscript was published. In `src/schedule/system/runscript-rows.ts`, add a short comment above `readRunscriptRows` saying it reads names through `listRunscriptNames` rather than `catalogRunscripts`, because the catalog call writes the Git exclusion on every call and a tick would repeat that write each second. Make no production behavior change. The existing cases in both new test modules must keep passing untouched. Verify that the new case would fail if the rows module called the catalog function instead, which the work task can confirm with the diff-scoped test run it is allowed to use.


* Route runscript creation through the shared file-path helper, so the runscript path is defined in one place as the commit intended (technical debt).

Existing Issue: The commit exports `runscriptFilePath` so the runscript path has a single definition, and `readRunscript` was switched to it, but `createRunscript` still builds the same `<name>.rs` path inline, so the rule lives in two places in the file the commit centralized. Severity: 3/10

Existing Risk: 3/10 - A later change to the file-name rule applied to only one of the two definitions would make a newly created runscript land at a path that the reader, the rows' open flag, and the editor never look at.

Proposal Risk: 1/10 - Creation, reading, and the open flag would then share one definition, so the drift cannot start in that module, though a later naming change still has to be made in the one helper.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "route createRunscript through runscriptFilePath". In `src/schedule/system/runscript-files.ts`, `createRunscript` computes its target with its own join of the scripts directory and the name plus the `.rs` suffix; replace that line with a call to the exported `runscriptFilePath(projectRoot, name)` that `readRunscript` already uses, keeping the existing `isRunscriptName` check before it and the directory, `createExclusive`, and `readRunscript` calls in their current order. Leave `cloneRunscript` and `newUntitledRunscript` unchanged, since they build from `nextFreeName` output rather than a bare name. The cases that must keep passing untouched are the create-path tests in `src/schedule/system/runscript-files.test.ts` (creating a missing scripts directory, keeping an existing runscript, refusing an invalid name, refusing a symlinked directory or target) and the `runscriptFilePath` case in the same file. No behavior changes, so no expectation is added or edited. Verify with a plain read that no other function in `src/schedule/system/runscript-files.ts` joins the scripts directory with a bare name and the `.rs` suffix.


* Correct the message bus comment that still calls the schedules channel a low-frequency signal, now that the same channel carries a per-second tick (technical debt).

Existing Issue: The comment above the schedules event type still describes the whole channel as a low-frequency signal, but the tick variant this commit adds is raised on every scheduler tick, so the channel is no longer low-frequency as a whole. Severity: 2/10

Existing Risk: 3/10 - A maintainer who trusts that comment could register a listener for both schedules variants without a type filter and do per-second work, believing the channel is quiet.

Proposal Risk: 1/10 - A reader sees both frequencies before subscribing, and the plugin-facing promise still holds because the schedules topic source subscribes to the changed variant only.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1739 "state the tick frequency in the schedules channel comment". In `src/bus.ts`, the comment above the schedules event type calls the channel a named, low-frequency signal that a tab plugin may subscribe to. Reword it so the changed variant is the low-frequency signal plugins subscribe to, and the tick variant is raised on every scheduler tick, about once a second, and is internal to the host. Keep the existing pointer to the plugin notification path and the one-line comment already on the tick variant. Change no type, listener, or emission: the schedules topic source in `src/plugins/topics.ts` subscribes to changed only, and the tick emission in `src/schedule/manager.ts` is correct as written. No test pins comment text. Verify by reading the reworded comment against those two places.
