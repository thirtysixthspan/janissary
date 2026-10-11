# Keep the fallback roles file editable

Complexity: 3/10 (threshold: 7).

## Goal

Let the roles tab keep editing whichever file it actually fell back to when an earlier roles file broke, instead of refusing every edit and naming a healthy file as unusable.

## Approach

The refusal is a server-side decision, so nothing in the browser changes: the tab always raises the intent and the activation decides. Today `readRolesFile` folds a broken earlier candidate's problem into the read of the file it fell back to — `{ ...attempt.read, problem: "<broken problem> — showing the home roles file." }` — so `edit` in `activate.ts`, which refuses on any `problem`, cannot tell a problem about the file now on screen from a problem about the file it skipped.

Carry the damaged file's own path beside the problem. Add `unusablePath` to `RolesRead`, set only where the file in effect itself decoded nothing or dropped something, and leave it absent on the clean read a fallback returns. `edit` then refuses on `read.source === 'default' || read.unusablePath !== undefined` and names `read.unusablePath ?? read.path`. The problem line is untouched, so the tab still shows the file it skipped.

## Implementation steps

1. Add `unusablePath` to `RolesRead` in `src/plugins/roles/roles-file.ts`, set to the file's own path on the partly-decoded read and on the defaults fallback, and change `edit` in `src/plugins/roles/activate.ts` to refuse on it. Run `./scripts/run.mjs check-diff`.
2. Add regressions for the editable fallback beside the partly damaged refusal. Run `./scripts/run.mjs check-diff`.
3. Update `product/specs/roles.md` and `documentation/user-documentation/tab-types/roles.md`, promote this plan, and remove only the resolved entry from the pull request backlog. Run `./scripts/run.mjs check-diff`, then commit and push to the same open PR.

## Tests

A project file holding invalid JSON beside a healthy home file reads the home roles, carries the broken project path only in the problem line, carries no unusable path, and a rename through the activation reaches the home file while the broken project's bytes stay untouched. A partly damaged file in effect still refuses every edit, names its own path, and leaves its bytes unchanged. A read that falls back from a broken project file onto a partly damaged home file names the home file as the unusable one. The defaults fallback still refuses and still names the broken path it named before.

## Out of scope

The client, the payload contract, the problem line's wording, repairing a damaged file on the user's behalf, the defaults-fallback path choice when several files break, PR description changes, and unrelated documentation.