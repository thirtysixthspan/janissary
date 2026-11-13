### roles

Open the roles tab to edit each role's model choices and native commands for `ask` and `tell`.

**Usage**

`roles`

**Use cases**

- Browse the available agent roles.
- Review the harness, model, effort, and command choices assigned to each role.
- Choose only enabled models from the catalog; use `models` to refresh or edit that catalog.
- Grant native commands to roles used by `ask` and `tell`. The default `ask` role can query databases, browse pages, read files from the workspace, and ask or approve questions; `tell` also starts with database create/delete and browser eval.
- Edit `~/.janissary/roles.json`, or a project's `.janissary/roles.json`, which replaces it entirely. The `ask` and `tell` commands use their matching roles; other roles remain saved choices for a person, script, or agent to read.

**Examples**

- `roles` opens the roles tab, where each card has **Models** and **Commands** sections.
- `roles left` is refused with `Usage: roles`.
- `models` opens the model catalog used by role choices.
