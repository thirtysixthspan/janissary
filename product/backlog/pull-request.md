<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Share the catalog path definitions between the hosts guard and the catalog reader so a future path change cannot silently disable the refusal.

Existing Issue: The guard in src/plugins/hosts/ssh-intents.ts rebuilds the two catalog locations with literal '.janissary' and 'hosts.json' segments even though src/plugins/hosts/hosts-file.ts owns the catalog filename and the path construction the reader uses, so the refusal's definition can drift from the paths that actually supply the hosts. Severity: 3/10

Existing Risk: 4/10 - If the catalog filename or location changes in the reader but not in the guard, the guard fails open and an export aimed at the catalog silently destroys every saved host again, with no test tying the two definitions together.

Proposal Risk: 2/10 - Both the reader and the guard would derive their paths from one exported helper, so the only residual hazard is a future catalog source that forgets to use it, which a test comparing the helper with the reader's reported path can cover.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 2242 "share the catalog path definitions between the hosts guard and the catalog reader". In src/plugins/hosts/hosts-file.ts, extract the two catalog locations into an exported helper that returns the project and home catalog paths from the existing FILE_NAME constant and the same path.join spelling readHostsFile uses, omitting the project path when root is empty; change readHostsFile to build its consulted paths from that helper. In src/plugins/hosts/ssh-intents.ts, change isCatalogPath to call that helper instead of rebuilding the paths with literal '.janissary' and 'hosts.json'. Add a test in src/plugins/hosts/activate.test.ts, or a colocated hosts-file test, that compares the paths returned by the shared helper with the path reported by readHostsFile for a project-only fixture and a home-only fixture, so a future divergence fails a test before the guard can fail open. Keep the existing refusal cases and the successful import and export cases in that suite unchanged, along with the target-read and target-write failure cases in src/plugins/hosts/export-ssh.test.ts and src/plugins/hosts/import-ssh.test.ts, which pin the surrounding behavior.
