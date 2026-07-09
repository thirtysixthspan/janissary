# deferred

## fix monitoring error 
 saw this error: Already monitoring with persona "assistant".
  monitoring using the same assistant may happen multiple time but for different targets.
  in this case a new monitoring window should be opened


## harness status

Tracked in plans/small-issues.md as "agent status should be synced to and accurately reflect harness status." The full issue as written asks for status that distinguishes the harness actively thinking from idling at its own prompt — that would require parsing each harness's own terminal output (spinners, prompts), which differs per CLI and is separate, larger work. This PR fixes the coarser, currently-wrong signal instead: busy (a harness process is running) vs. not busy (no harness process running at all).


## agent triggers
- file changes
- transcript triggers
