# technical-debt

## ready

## development

* Reduce the cognitive complexity of `findBareTask()` in `src/agent/task-resolution.ts` (line 51), reported at 24 against the allowed 15 in a file scoring 49.71 FTA across 96 lines. The function searches project tasks before installed tasks through a loop containing nested missing-root handling, real-path confinement checks, and ambiguity detection. Extract task-root validation into a local helper while retaining source precedence, missing-directory behavior, and the existing exported resolution signatures. This target is risk-sensitive because its real-path checks enforce the allowed-root security boundary. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `findBareTask()` in `src/agent/task-resolution.ts`. Severity: **medium**.

* Reduce the cognitive complexity of `parseShellArgument()` in `src/plugins/shell/parse-argument.ts` (line 25), reported at 20 against the allowed 15 in a file scoring 41.80 FTA across 48 lines. The function parses shell names and launch options through a token loop combining group-clause consumption, nested flag handling, unknown-option errors, and remote-address consumption. Flatten the flag branch with early continuation while preserving token advancement, case handling, and the rule that a remote target overrides the no-workspace flag; keep the exported argument shape intact. This target is risk-sensitive because it determines shell workspace, offline, and remote-launch options. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `parseShellArgument()` in `src/plugins/shell/parse-argument.ts`. Severity: **medium**.

* Reduce the cognitive complexity of `resolveSkill()` in `src/agent/skill-grants.ts` (line 17), reported at 19 against the allowed 15 in a file scoring 50.20 FTA across 100 lines. The function resolves project or installed skills through a source loop with separate nested checks for missing roots, candidate existence, directory identity, and file confinement. Extract skill-root resolution into a local helper that distinguishes an absent root from an invalid one while preserving project-first lookup and the exported skill-resolution contract. This target is risk-sensitive because its directory and symlink checks enforce skill-path confinement. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `resolveSkill()` in `src/agent/skill-grants.ts`. Severity: **medium**.

* Reduce the cognitive complexity of the allocation callback inside `launchCapabilities().launchTab` in `src/plugins/launch-tab.ts` (line 169), reported at 17 against the allowed 15 in a file scoring 57.10 FTA across 171 lines. The callback launches plugin tabs through a conditional chain mixing source-origin selection, remote-process adoption checks, existing-tab detection, and local-versus-remote workspace creation. Extract source-origin resolution and adoption validation into a file-private helper while preserving early exits, allocation registration order, and the published launch capability signature. This target is risk-sensitive because it routes remote launches and validates adopted PTY ownership. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against the allocation callback inside `launchCapabilities().launchTab` in `src/plugins/launch-tab.ts`. Severity: **low**.

## deferred


## declined
