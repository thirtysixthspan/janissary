# issues

## ready

* acp- directories are accumulating in `.janissary/`. move the location where these are maintained into a subdirectory `.janissary/`.    

* assure that acp sessions run opencode in standalone mode.
in acpLaunchFor: build the env from a clean base, scrub those OPENCODE_* routing/port vars, and add the flag for belt-and-suspenders:
return {
  command: 'opencode',
  args: ['--standalone', 'acp'],
  env: { OPENCODE_CONFIG_CONTENT: JSON.stringify({ model: harness.model }) },
};

## deferred

## declined
