<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Reduce the security exposure from role sessions reading the entire installed dependency tree.

Existing Issue: Bundled Claude and Codex adapters resolve inside Janissary's installation `node_modules`, so `resolveExecutableDirs` sets `SELF_DIR_R` to that entire tree and the sandbox profile allows the role process to read every installed package, including unrelated dependencies. Severity: 6/10

Existing Risk: 5/10 - A role agent that uses a granted native command capable of reading arbitrary files can inspect unrelated installation packages, and every future dependency silently expands that read surface.

Proposal Risk: 2/10 - The adapter and its required runtime dependencies remain readable, but unrelated packages outside that closure stay denied.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1983 "limit role ACP sandbox reads to adapter dependencies". In `src/sandbox/harness-spawn.ts`, replace the nearest-`node_modules` `packageRootDir` carve-in for bundled ACP role launches with a read allow-list scoped to the adapter executable and its required runtime dependency closure, while preserving the existing carve-in behavior for other harness executables. Keep the server Node runtime readable where the adapter shebang needs it. Add resolver coverage in `src/sandbox/harness-spawn.test.ts` and a live Seatbelt case in `src/sandbox/live.sandbox.test.ts` proving the bundled adapter can load its own runtime dependencies while an unrelated sibling package remains unreadable; retain coverage for existing harness executable paths. Update `src/sandbox/install-reads.ts`, `product/specs/sandbox.md`, and `documentation/user-documentation/command-bar/tasks.md` to describe the resulting boundary, and verify the profile denies paths outside the selected adapter closure.
