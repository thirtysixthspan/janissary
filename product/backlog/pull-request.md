<!-- This file is for maintaining work items tied to a pull request and lives on a pull request's own branch while that pull request is open. It should be empty on master, holding no more than this comment and the heading. -->

# pull-request

* Release every terminal a plugin starts in one payload factory, not only the first.

Existing Issue: `withResources` in `src/tab/openers.ts` collects the ids it spawned but returns only `terminals[0]` for adoption, so a factory that starts a second terminal leaves it registered under the empty label it was spawned with, and the focus-an-existing-tab path adopts the new terminal onto the tab that already existed. Severity: 5/10

Existing Risk: 6/10 - A plugin calling `spawnTerminal` twice in one factory leaks a process that no tab close, plugin dispose, or plugin disable will ever release, because the per-tab release walk and the tab's connection list both key on the label the terminal was adopted onto.

Proposal Risk: 3/10 - Adopting every terminal puts several sessions on one tab, so closing it now kills several processes where it previously killed one, which is the correct reading of the resource but a wider blast radius than today.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: adopt and release every terminal a plugin payload factory starts". In `src/tab/openers.ts`, return the whole `terminals` array from `withResources` rather than `terminals[0]`, adopt each id in both `openPluginTab` and `updatePluginTab`, and keep the existing failure path that kills whatever the factory started before it threw. `src/plugins/shell/open-tab.ts` starts exactly one terminal and needs no change. Decide deliberately what the focus-an-existing-tab path should do — refusing to spawn a second terminal is defensible and simpler than adopting one the user did not ask for — and pin whichever is chosen. Add the second-terminal case to `src/tab/manager.test.ts` and assert that both sessions are released by one `closeTab`.


* Declare or confine the terminals a plugin starts, since `spawnTerminal` reaches an unsandboxed process without appearing in the declaration the host validates.

Existing Issue: `spawnTerminal` is a resource rather than a capability, so `restrictToDeclared` in `src/plugins/context.ts` never gates it and every bundled plugin receives it whether or not its declaration asks for it, while workspace confinement applies only when the caller passes a `workspace`, which nothing requires. Severity: 5/10

Existing Risk: 5/10 - Any plugin, including one added later without a reviewer looking at this surface, can start an interactive shell in any directory with no Seatbelt profile, which is a wider blast radius than the plugin contract had before this change and is invisible in the declaration that activation validates.

Proposal Risk: 3/10 - Gating it costs every future plugin a declaration edit before it may start a process, and a plugin that genuinely wants an unsandboxed shell still has to say so out loud.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: declare or confine the terminals a plugin starts". Settle the boundary in one of two ways and write it down. Either add `spawnTerminal` to the server capability set so `restrictToDeclared` gates it and `src/plugins/shell/manifest.ts` declares it, which would raise the documented server capability count from twenty-two to twenty-three and require the matching edit in `documentation/developer-documentation/tab-plugins.md` and `src/plugins/documentation.test.ts`. Or keep it a resource and make confinement unconditional for a terminal not launched inside a workspace, which is the stronger guarantee and matches the plan's reasoning that a workspace confines a shell exactly as that tab's own shell is confined, at the cost of changing what an unworkspace'd plugin terminal may do. State the choice in the `spawnTerminal` section of `documentation/developer-documentation/tab-plugins.md` and in `product/specs/tab-plugins.md`, and add a case to `src/plugins/declaration-validation.test.ts` or `src/plugins/shell/activate.test.ts` pinning it, so a later change is a deliberate act rather than a side effect.


* Make a terminal spawned without `args` be the shell itself, rather than a shell running an empty command.

Existing Issue: `TabPluginTerminalOptions.args` is optional and `TabManager.spawnTerminal` in `src/tab/manager.ts` forwards it as given, so `spawnPty` falls back to `shellCommandArgs` with the empty command it was handed and spawns an interactive shell whose only command is the empty string. Severity: 4/10

Existing Risk: 5/10 - The call a plugin author is most likely to write, `spawnTerminal({ cwd })`, opens something that looks like a shell tab and behaves like a shell that has already run its only command, so the failure is discovered by using it rather than by reading the signature.

Proposal Risk: 2/10 - The defaulting goes at the resource boundary only, so the shell plugin's explicit `args: []` and every existing `spawnPty` caller keep the meaning they have today.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: default a terminal spawned without args to the shell itself". In `src/tab/manager.ts`, normalize the options before spawning so an absent `args` becomes `[]` instead of being forwarded as `undefined` into the fallback inside `src/pty.ts`, and state that in the `TabPluginTerminalOptions` declaration comment in `src/plugins/api.ts` and in the `spawnTerminal` section of `documentation/developer-documentation/tab-plugins.md`. Keep the distinction `src/pty.ts` already draws — at that layer an omitted `args` still means "run this command through the shell", because that is what its own callers mean — so put the defaulting at the resource boundary rather than in `spawnPty`, and keep `src/pty.test.ts`'s coverage of the two meanings passing untouched. Add a case to `src/tab/manager.test.ts` asserting that a `spawnTerminal` with no `args` reaches `spawnPty` with an empty argv.


* Give a plugin the per-tab identity `useStatusWindows` re-arms on, which the plugin contract does not currently expose.

Existing Issue: The hook's own documentation in `web/src/shared/status-windows/useStatusWindows.ts` says `activeKey` is the tab's label and that a tab becoming active re-arms the auto-show, and every host caller passes `tab.label`, but `TabPluginClientCapabilities` carries no label, so the shell tab's metadata row passes the constant `'shell'`. Severity: 4/10

Existing Risk: 4/10 - The five-second auto-show a shell tab's status windows are documented to keep fires once when its row mounts and never again, so returning to a shell tab shows no connections panel where every agent tab would, leaving hover and pin as the only ways to see one.

Proposal Risk: 2/10 - Exposing a label to plugin bodies widens the client contract by one read-only field, and a plugin could then key its own per-tab state on a value the host considers stable.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: let a plugin tab identify itself to useStatusWindows". Add the tab's label to the client capability object in `web/src/plugins/api.ts`, threading it through the `createPluginClientCapabilities` call `web/src/plugins/PluginBody.tsx` already makes, and have `ShellTabMeta` in `web/src/plugins/shell/ShellTab.tsx` pass it instead of the constant. Publish it from `web/src/plugins/api.ts` beside the other published surfaces, note it in the client capability list in `documentation/developer-documentation/tab-plugins.md`, and raise the documented client count from twelve to thirteen in the same file and in the literal `src/plugins/documentation.test.ts` pins. `web/src/shared/status-windows/useStatusWindows.test.ts` covers the re-arm and must keep passing; add a shell-side case asserting two shell tabs re-arm independently of one another.


* Correct the plan's own contradiction about `disableStdin`, which it lists as out of scope in one section and describes as shipped in another.

Existing Issue: `product/plans/complete/shell-tab.md` states that `disableStdin` was considered and not chosen and lists "no `disableStdin`" under Out of scope, while its client section describes the terminal as created with stdin disabled, which is what `web/src/plugins/shell/useShellTerminal.ts` does. Severity: 3/10

Existing Risk: 3/10 - The plan is the record a later reader trusts about why the terminal refuses input, and as written it both forbids and requires the shipped line, so the next person to read it cannot tell which was decided.

Proposal Risk: 1/10 - Only prose changes, and the recorded user answer already describes what the code does.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: reconcile the plan's disableStdin decision with the shipped terminal". In `product/plans/complete/shell-tab.md`, settle the contradiction in favour of what ships: state in the design decisions that the terminal is never focused *and* is built with stdin disabled as the structural half of the same rule, and replace the "no `disableStdin`" clause in the Out of scope entry with the click-to-type path that is genuinely out of scope. Keep the reasoning already at the point of enforcement in `web/src/plugins/shell/useShellTerminal.ts`. Check `product/specs/shell-tab.md` for the same claim in user-facing wording and correct it there too if it describes the terminal as merely unfocused, and re-read the pull request description, whose Verification section repeats the manual check for this behavior.


* Remove the unused history-walk helper whose test passes without the shipped code ever calling it.

Existing Issue: `recallLine` is exported from `web/src/plugins/shell/command-line-rules.ts` and referenced only by its own test file, while the walk the tab actually performs is the one `useCommandBarKeys` does from its `history` prop. Severity: 3/10

Existing Risk: 4/10 - The plan names the history walk as one of the pure functions in that module, and a test named for that walk's edge cases passes against a function nothing calls, so a change to the real recall in `useCommandBarKeys` would be reported as covered when it is not.

Proposal Risk: 1/10 - Deleting dead code and its test cannot change behavior, and the recall the user sees is untouched.

Proposal: Execute ./ai/tasks/work-an-issue.md "PR 1526: drop the shell plugin's unused recallLine helper". Delete `recallLine` from `web/src/plugins/shell/command-line-rules.ts` and its cases from `web/src/plugins/shell/command-line-rules.test.ts`, and correct the sentence in `product/plans/complete/shell-tab.md` that names the history walk among that module's pure functions, since the walk is the published `useCommandBarKeys` hook's. Check whether `CONTROL_KEYS` in the same module has an external consumer at all and narrow it to module scope if not. The remaining rules, `routeFor`, `shellLine` and `controlCharacterFor`, are used by `ShellTab` and their cases must keep passing untouched.

