# technical-debt

## ready

## development

* Reduce the cognitive complexity of `parseShellArgument()` in `src/plugins/shell/parse-argument.ts` (line 25), reported at 20 against the allowed 15 in a 57-line file. The function parses shell launch arguments through a stateful token loop whose nested branches handle flags, group selectors, remote addresses, and the shell name. This is risk-sensitive because it parses shell launch options. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `parseShellArgument()` in `src/plugins/shell/parse-argument.ts`. Severity: **medium**.

* Reduce the cognitive complexity of `resolveSkill()` in `src/agent/skill-grants.ts` (line 13), reported at 19 against the allowed 15 in a 102-line file. The function searches project and installation roots while combining missing-path recovery, filesystem checks, and symlink containment validation. This is risk-sensitive because it validates filesystem paths for security. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `resolveSkill()` in `src/agent/skill-grants.ts`. Severity: **medium**.

* Reduce the cognitive complexity of `buildTabView()` in `src/tab/view.ts` (line 61), reported at 19 against the allowed 15 in a 219-line file. The function builds a wire-format tab view, with conditional workspace and remote provisioning fields alongside plugin, recording, transcript, and harness data. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `buildTabView()` in `src/tab/view.ts`. Severity: **low**.

* Reduce the cognitive complexity of `fireDue()` in `src/schedule/system/manager.ts` (line 89), reported at 18 against the allowed 15 in a 147-line file. The function walks due system schedules and combines batch execution, stale-entry checks, persistence, and notification or output handling across nested branches. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `fireDue()` in `src/schedule/system/manager.ts`. Severity: **low**.

* Reduce the cognitive complexity of `ensureShell()` in `src/system-shell.ts` (line 71), reported at 18 against the allowed 15 in a 111-line file. The function reuses or restarts the existing system shell, or launches one through the shell plugin and validates or closes the resulting terminal. This is risk-sensitive because it manages shell and PTY lifecycle. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `ensureShell()` in `src/system-shell.ts`. Severity: **medium**.

* Reduce the cognitive complexity of `runSystemSchedule()` in `src/commands/schedule.ts` (line 63), reported at 17 against the allowed 15 in a 100-line file. The function handles system schedule listing, creation, cancellation, and clearing through a sequence of action branches with inline validation and result reporting. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `runSystemSchedule()` in `src/commands/schedule.ts`. Severity: **low**.

* Reduce the cognitive complexity of `completeSystemSchedule()` in `src/completion/system-schedule.ts` (line 8), reported at 16 against the allowed 15 in a 37-line file. The function chooses schedule completions by command position and preceding tokens, with nested checks for cancel names, recurring days, and complete dates. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `completeSystemSchedule()` in `src/completion/system-schedule.ts`. Severity: **low**.

* Reduce the cognitive complexity of the `launchTab` callback in `launchCapabilities()` in `src/plugins/launch-tab.ts` (line 173), reported at 17 against the allowed 15 in a 201-line file. The callback validates launch context, checks existing tabs, branches between remote and local launches, and handles workspace cloning and registration. This is risk-sensitive because it launches remote tabs and may adopt a running process. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against the `launchTab` callback in `src/plugins/launch-tab.ts`. Severity: **medium**.

* Reduce the cognitive complexity of `scheduleTopicAction()` in `src/plugins/schedule-topic-actions.ts` (line 6), reported at 16 against the allowed 15 in a 56-line file. The function dispatches schedule topic actions while checking ownership and authorization across tab and system schedules. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `scheduleTopicAction()` in `src/plugins/schedule-topic-actions.ts`. Severity: **low**.

* Reduce the cognitive complexity of `parseScheduleCommand()` in `src/schedule/index.ts` (line 20), reported at 17 against the allowed 15 in a 95-line file. The parser separates system actions, list and clear operations, cancellation, and named schedule forms through a chain of token and clause checks. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `parseScheduleCommand()` in `src/schedule/index.ts`. Severity: **low**.

* Reduce the cognitive complexity of `ensureSystemScheduleExcluded()` in `src/schedule/system/local-exclude.ts` (line 35), reported at 17 against the allowed 15 in an 80-line file. The function checks Git worktree state and tracked or ignored paths before safely adding local system-schedule paths to the repository's exclude file. This is risk-sensitive because it validates filesystem and Git paths before writing to repository metadata. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `ensureSystemScheduleExcluded()` in `src/schedule/system/local-exclude.ts`. Severity: **medium**.

* Reduce the cognitive complexity of `contiguousMatch()` in `web/src/shared/fuzzy-match.ts` (line 109), reported at 16 against the allowed 15 in a 135-line file. The function scores each uninterrupted query occurrence in each path with nested scans, keeps the best occurrence, and sorts the resulting matches. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `contiguousMatch()` in `web/src/shared/fuzzy-match.ts`. Severity: **low**.

* Reduce the cognitive complexity of `onEvent()` in `web/src/shared/ws/ws.ts` (line 83), reported at 16 against the allowed 15 in a 270-line file. The handler dispatches WebSocket server events through a switch whose cases update state, deliver PTY data, notify listeners, or answer collection requests. This is risk-sensitive because it handles network and PTY events. Resolve by running the `ai/tasks/hygiene/reduce-complexity.md` task against `onEvent()` in `web/src/shared/ws/ws.ts`. Severity: **medium**.

## deferred

## declined
