# features

## ready

* Create an new tools tab. Tools refer to tools that are available to an acp session, for example, read, grep, edit, websearch. The permission to use tools should be added to the configuration passed to an acp session on startup. Calling opencode `opencode debug agent build` will provide the tool set, e.g.:
"tools": {
  "invalid": true, "bash": true, "read": true, "glob": true, "grep": true,
  "edit": true, "write": true, "task": true, "webfetch": true,
  "todowrite": true, "websearch": true, "skill": true
} 
The tools tab should be modeled after the commands tab. Each tool should have a toggle for enabled or disabled application wide. Configuration of tools should be stored in .janissary/tools.config and handled similarly to .janissary/commands.json. The tab should have a similar metadata bar to the commands tab, where the config file location is shown on the left and the refresh and split icons are on the right. Each role in the role tab should have another selection for tools, that operates just like the commands selection. Questions about how tools are cofniugured should be answered by examinig how commands are configured.  


## development

* add an ACP skill to allow an agent to spin up other agents with different models, pass them ai tasks (form the repository) to execute and access to monitor the transcript as the agent works, and to recieve the response.



## deferred

* Bundle janissary as a mac application that can be dowloaded and installed into /Applications and launched from an icon in the toolbar.

* Durable flows across relaunch - capture exit information from a harness and be able to use it to restart a session. a relaunch harness picker. workspace dir would need saved and re-created.

## declined

