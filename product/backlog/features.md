# features

## ready

* Native application commands should be maintained in a registry. The registry of commands should be available in a new `commands` tab. The `commands` tab should mirror the `models` tab. Each application comand and subcommand is shown alphabetically in a table along with an action column containing two toggles. One toggle controls whether an agent can call the command in an ACP connection. The other toggle controls whether the command is enabled/disable application wide. All commands are enabled by default. Command registry is stored in ~/.janissary/commands.json with a project override of .janissary/commands.json. Commands that are disabled from agents should show up as dimmed in the roles tab with a tooltip informing that the command is disabled. disabled commands called by an agent should be refused. agents should only recieve the list of enabled commands when launched so as to avoid calling disabled commands. disabled commands can be added to a role, but will be dimmed when added.

## development

* add an ACP skill to allow an agent to spin up other agents with different models, pass them ai tasks (form the repository) to execute and access to monitor the transcript as the agent works, and to recieve the response.



## deferred

* Bundle janissary as a mac application that can be dowloaded and installed into /Applications and launched from an icon in the toolbar.

* Durable flows across relaunch - capture exit information from a harness and be able to use it to restart a session. a relaunch harness picker. workspace dir would need saved and re-created.

## declined

