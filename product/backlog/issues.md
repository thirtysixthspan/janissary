# issues

## ready

* support the following case of auto approve with the claude harness
─────────────────────────────────────────────────────────────────
 Bash command · from the general-purpose agent
 Tip: auto mode handles these prompts for you — choose "switch
 to auto mode" below
 Run shell command
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 │ git checkout master && git pull origin master 2>&1 | tail -5
 │ && ./scripts/run.mjs check-malicious-package --audit
 │ ./package-lock.json 2>&1 | tail -5; echo exit=$?
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 A variable in this command can't be checked before it runs

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and switch to auto mode · auto mode handles these
      prompts for you
   3. No


## development

## deferred

## declined
