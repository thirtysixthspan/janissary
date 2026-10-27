<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Deliver the plan's user-facing content rule by keeping storage paths out of command help.

Existing Issue: The new `help/roles.md` says roles are stored in `roles.json`, contrary to the canonical plan's rule that command help describe user-visible behavior without file paths or module names. Severity: 2/10

Existing Risk: 2/10 - A reader may take the bare filename as a complete or stable instruction for locating the roles data, though the roles tab itself does not depend on this help text.

Proposal Risk: 1/10 - Removing the storage filename leaves command help focused on the role choices users can make, while the full roles documentation continues to describe where the data lives.

Proposal: Execute ./ai/tasks/feature/work-pull-request-issue.md 1799 "remove the roles storage filename from command help". Update `help/roles.md` to describe the role-to-harness, model, and effort choices without naming `roles.json`, following the canonical plan's user-facing content rule. Keep the storage-path details in `product/specs/roles.md` and `documentation/user-documentation/tab-types/roles.md`, where they are useful to contributors and users managing their files. No test pins help wording; verify the revised page still follows the fixed heading, description, Usage, Use cases, and Examples layout and contains no storage path.
