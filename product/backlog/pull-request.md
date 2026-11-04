<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Plan fidelity: record 07's actual verification results and partial manual status instead of completing the plan with its planning-pass ledger.

Existing Issue: The plan is moved to complete while its verification ledger still says the documentation, help, and requirement-map suites were "not rerun by this planning pass" and asks implementation to record commands and results, with no 07 implementation SHA, build or chunk-closure result, or per-scenario manual outcome recorded anywhere in the commit, even though the commit message says it records the integration evidence. Severity: 5/10

Existing Risk: 4/10 - The completed plan implies a verification record it does not contain, so a later reviewer or release owner cannot distinguish the focused suites and builds that ran from the manual scenarios that did not, and may treat 07 as fully verified.

Proposal Risk: 2/10 - The ledger will honestly record the available automated and build evidence plus the explicit partial manual coverage, but M3, M4, M5, and M7 remain unexercised until their browser and remote resources exist.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1916 "record the 07 verification ledger results". Update the verification table in `product/plans/complete/connections-tabs-07-specs-docs-integration.md` with the actual focused suite commands and results, the `npm run docs:build` and `npm run build:web -- --manifest --sourcemap` outcomes including the connections dynamic-entry and chunk-closure check or its concrete unavailable reason, and the 07 implementation SHA. Record the manual result honestly: M3, M4, M5, and M7 were not exercised, state the missing assigned-browser, authenticated provider, and compatible remote-host resources, and do not claim a fully manually verified feature. If some evidence exists only in the implementation report, summarize it with its source rather than inventing results. This is a plan-record correction, not a production or test change; the migrated `src/plugins/documentation.test.ts` assertions must keep passing.
