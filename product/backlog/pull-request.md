<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Update the scheduling spec's store-format description to cover version 2 snapshots and the optional paused field.

Existing Issue: product/specs/scheduling.md still describes the system schedule store as version-1-only, saying that invalid version-1 entries produce a load error and that a newer store version is unsupported, while this commit accepts version 2 snapshots whose recurring entries may carry paused and treats only version 3 and above as unsupported. Severity: 5/10

Existing Risk: 5/10 - A maintainer or a future agent treats the spec as the store contract and concludes that version 2 files are unsupported or that paused is not a valid persisted field, which invites a wrong compatibility or migration decision.

Proposal Risk: 2/10 - The spec then agrees with the decoder, whose existing unit tests already pin version 1 acceptance, version 2 with and without paused, rejection of paused on version 1 and of non-true or non-recurring paused on version 2, and version 3 rejection, so the edit changes no behavior.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2253 "update the scheduling spec for version 2 store snapshots". In product/specs/scheduling.md's "Durable system schedules and runscripts" section, replace the version-1-only wording with the contract implemented in src/schedule/system/store-decode.ts and src/schedule/system/types.ts: a snapshot may be version 1 or version 2; a version 2 entry may carry an optional paused: true field and only when it is recurring; a version 1 entry must not carry paused; invalid JSON, invalid entries, and versions above 2 produce a load error without rewriting the file; and saving a higher unsupported version is blocked so an older process cannot downgrade it. Keep the paragraph's other guarantees intact — atomic replacement, unique opaque keys, and the runscript name plus `script <name>` command fields. No source change belongs here: src/schedule/system/store-decode.test.ts already covers version 1 acceptance, version 2 with and without paused, rejection of paused in a version 1 entry and of false, non-boolean, or one-shot paused in version 2, and version 3 rejection. Verify by reading those assertions and checking each new spec sentence against them.
