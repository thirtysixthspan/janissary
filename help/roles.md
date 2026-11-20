### roles

Open the roles tab to edit each role's model choices and native commands for `ask`, `tell`, and other named roles such as `user-interface`.

**Usage**

`roles`

`roles list`

**Use cases**

- Browse the available agent roles.
- Review the harness, model, effort, and command choices assigned to each role.
- Print the roles and their enabled models and commands as JSON with `roles list`, for scripts or for an agent to read.
- Choose only enabled models from the catalog; use `models` to refresh or edit that catalog.
- Grant native commands to roles used by `ask` and `tell`. The default `ask` role can query databases, browse pages, read files from the workspace, find workspace files by path, find text inside workspace files, search the web, read a web page, ask or approve questions, and push a message into notifications; `tell` also starts with database create/delete, browser eval, writing and editing workspace files, applying a multi-file patch, launching another agent with `subagent`, and notifications with `notify`. The default `user-interface` role grants only `tab`, which lets an agent focus, move, arrange, and dock tabs.
- Edit `~/.janissary/roles.json`, or a project's `.janissary/roles.json`, which replaces it entirely. The `ask` and `tell` commands use their matching roles; other roles, including `user-interface`, remain saved choices that a person, script, or `subagent --role` can launch by name.
- In the roles tab, grants appear in the native command order with duplicates kept together. Unknown commands are dimmed with `Not a native command`, and disabled ones with `Disabled application-wide` or `Disabled for agents`; empty **Models** and **Commands** sections read `No models` and `No commands`.

**Examples**

- `roles` opens the roles tab, where each card has **Models** and **Commands** sections.
- `roles list` prints the roles as pretty JSON. Each role shows its name, description, the model choices that are still in the enabled catalog, and its native command grants.
- `roles left` is refused with `Usage: roles`. `roles list left` is refused with `Usage: roles list`.
- `models` opens the model catalog used by role choices.
