# Add a config opt-out for shell tab recording

**Complexity: 3/10** — one boolean on the config, one condition in the place that already decides whether a plugin terminal is recorded, and the docs and spec sentences that describe what happens when it is off. No new subsystem, no new UI.

## Summary

Recording a shell tab puts what its zsh printed in a plaintext file on disk, and zsh echoes what is typed back into the terminal — so a password entered at a `sudo` or `psql` prompt lands in the recording, where the same secret entered into an ssh or harness tab would not. The feature's plan accepted that and documented it; what it did not settle is whether a user who does not want that can decline it. Today they cannot: recording is automatic for every shell tab, and the only warning is a paragraph in the documentation they may not have read.

`Config` already carries `sandboxWorkspaces`, a boolean defaulting to `true` whose comment names exactly what it trades against. This is the same shape for the same kind of reason, and it belongs beside it.

## Design decisions

1. **The default stays `true`.** The plan's decision was that recording is automatic for every shell tab, and a user who has not expressed a preference should get the behavior the feature ships. The opt-out exists for the user who knows their machine and disagrees — which is what makes the default a decision rather than an oversight.

2. **The check goes in `TabManager.recordTerminal`, where the recording decision already lives.** That method already asks whether the plugin's declaration asked for a terminal to be recorded; one more conjunct is the whole change. Nothing downstream needs to know: no recorder is installed, so no file is written, `Tab.recording` is never set, and the metadata row draws no flag at all — which is the state an agent tab is already in, and which needs no separate rule for the disabled case.

3. **Harness and ssh tabs are untouched by the key.** Neither echoes its input, so neither has the exposure this key exists to answer, and turning it off must not change what they record. The condition lives only on the plugin-terminal path, so that is structural rather than a rule someone has to remember.

4. **The name says what it is off, not what it turns on.** `recordShellTabs` names the thing being recorded. `sandboxWorkspaces` sets the precedent of naming the resource rather than the feature.

## What already exists (reuse, don't rebuild)

| Piece | Where |
| --- | --- |
| The config type and its defaults | `src/config.ts` — `Config`, `DEFAULT_CONFIG` |
| The exact precedent, a security-motivated boolean defaulting true | `src/config.ts` — `sandboxWorkspaces` |
| The merge behavior that makes a missing key safe | `src/config.ts` — a partial config is merged over the defaults; an invalid file is left untouched with a warning |
| The place the decision is already made | `src/tab/manager.ts` — `recordTerminal` |
| The sentence stating the exposure | `documentation/user-documentation/advanced-agents/harness.md` — the shell-recording paragraph |
| The scope statement that says only what happens when recording is on | `product/specs/harness-recording.md` § Scope |

## Proposed changes

- `src/config.ts` — add `recordShellTabs: boolean` to `Config`, defaulting to `true` in `DEFAULT_CONFIG`, with a comment naming the consequence it trades against, in the shape of the `sandboxWorkspaces` comment.
- `src/tab/manager.ts` — `recordTerminal` additionally requires `getConfig().recordShellTabs`. `getConfig` is already reachable from the managers registry; if it is not already imported here, import it directly rather than threading it through, since `recordTerminal` is already the single decision point.
- `documentation/user-documentation/advanced-agents/harness.md` — the shell-recording paragraph states the exposure; add the key beside it, saying what turning it off does.
- `product/specs/harness-recording.md` § Scope — say that a project with shell recording off records no shell tab, and that harness and ssh tabs are unaffected by the key.
- `product/specs/shell-tab.md` § Session recording — one sentence naming the key, since that section is where a shell tab's reader looks.

No protocol, type, or component change. The key is server-side only: the client never reads it, because the client learns a tab's recording from the tab's own view rather than from whether one is configured.

## Tests

- `src/config.test.ts` — one case asserting `recordShellTabs` is `true` for a config file that does not mention it, matching the existing `interactiveShellDetection` default case which exists for exactly this reason: a config written before the key was added must not silently change behavior. The existing invalid-scalar case already proves a non-boolean value falls back to the default, and no new case is needed for that.
- `src/tab/manager.test.ts` — the `openPluginTab` cases added for this branch already assert that `recordsTerminal` gates `registerShellObservers`. Add the two halves of the new conjunct: with the config default, a plugin that declared `recordsTerminal` still gets its recorder; with the key set to `false`, the same plugin gets none. `makeTabManagerWithManagers` builds the managers object directly, so the config has to be either imported and mocked or set through the real loader — check how the file already reaches module-level state before choosing, and prefer whatever does not make the other cases in that file depend on config.

Nothing else moves: `src/harness/manager.test.ts` and `src/harness/recorder.test.ts` construct recorders directly and never consult the config, so they must keep passing untouched.

## Out of scope

- Any opt-out for harness or ssh recording. Neither echoes input, so the key does not apply and must not be read as though it did.
- Suppressing the keystroke echo itself. `stty -echo` would break the interactive shell — the user would not see what they type — so the exposure cannot be engineered away at the recorder. The opt-out is the whole of what is available.
- A UI toggle, or a per-tab override. Both belong to a `profile`/settings surface this project does not have for any other config key; the config file is how `sandboxWorkspaces`, `transcriptMaxLines` and `syncPaths` are all set.
- Changing the default, the recording format, or anything the plan already settled about shell recording.

## Verification

- `./scripts/run.mjs check-diff` after the change.
- Manual: with no config file, `zsh` records as before and the flag turns green on first output. Then set `"recordShellTabs": false` in `.janissary/config.json`, restart, and confirm a shell tab produces no `.cast` file and draws no recording flag — while a `harness claude` tab still records and still shows one. Remove the key and confirm recording resumes.