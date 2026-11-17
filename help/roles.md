### roles

Open the roles tab to edit each role's model choices and native commands for `ask` and `tell`.

**Usage**

`roles`

**Use cases**

- Browse the available agent roles.
- Review the harness, model, effort, and command choices assigned to each role.
- Choose only enabled models from the catalog; use `models` to refresh or edit that catalog.
- Grant native commands to roles used by `ask` and `tell`. The default `ask` role can query databases, browse pages, read files from the workspace, find workspace files by path, find text inside workspace files, search the web, and ask or approve questions; `tell` also starts with database create/delete, browser eval, writing and editing workspace files, and applying a multi-file patch.
- Edit `~/.janissary/roles.json`, or a project's `.janissary/roles.json`, which replaces it entirely. The `ask` and `tell` commands use their matching roles; other roles remain saved choices for a person, script, or agent to read.
- In the roles tab, grants appear in the native command order with duplicates kept together. Unknown commands are dimmed with `Not a native command`, and disabled ones with `Disabled application-wide` or `Disabled for agents`; empty **Models** and **Commands** sections read `No models` and `No commands`.

**Examples**

- `roles` opens the roles tab, where each card has **Models** and **Commands** sections.
- `roles left` is refused with `Usage: roles`.
- `models` opens the model catalog used by role choices.
