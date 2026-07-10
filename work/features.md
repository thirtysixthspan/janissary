
## in development


### monitor configuration
* monitors may use one of many configured acp channels (even though only opencode is available at this point, others will come in the future).
* a persona has a specific acp and model configured but that configuration should be able to be overridden at runtime.
* the monitor should begin by reporting the acp connection, and the selected model in the tab and concisely summarize its 'persona' in one sentence.
* there should be an up to date spec, help documentation, and public documentation.

### browser tabs should be exposed to monitors
- raw website content
- dom point in time captures?

### editor tabs should be exposed to monitors
- current state of the file being edited


## deferred

### fix monitoring error 
 saw this error: Already monitoring with persona "assistant".
  monitoring using the same assistant may happen multiple time but for different targets.
  in this case a new monitoring window should be opened

### harness status

Tracked in plans/small-issues.md as "agent status should be synced to and accurately reflect harness status." The full issue as written asks for status that distinguishes the harness actively thinking from idling at its own prompt — that would require parsing each harness's own terminal output (spinners, prompts), which differs per CLI and is separate, larger work. This PR fixes the coarser, currently-wrong signal instead: busy (a harness process is running) vs. not busy (no harness process running at all).

## agent triggers
- file changes
- transcript triggers
