# Core ACP sessions use the `ask` role with model fallback

Issue: when establishing an acp session, the models should use the 'ask' role. The role will provide multiple models in order of preference. each model should be tried until a given model succeeds. some model may be out of credits or not have the proper provider credentials. an ACP request should only fail once all the models in the role have been attempted.

Complexity rating: 5/10

## Goal

The core ACP session (the `ask` command, and plugin `startAcp`/`promptAcp`/`promptAcpResult`) stops hard-coding OpenCode with a model picked from the harness catalog. It reads the `ask` role from the roles file in effect and launches its entries in order — harness, model, and effort. A request moves on to the next entry when the current model fails before it has replied, and it fails only once every entry has been tried.

## Decisions

- **Where the role comes from.** The same roles file the roles tab edits: the project's `.janissary/roles.json` when it exists, else `~/.janissary/roles.json`, re-read for every request so an edit applies to the next session. The `ask` role is matched by trimmed, case-insensitive name, the same key the roles file uses for uniqueness. Reading for ACP never creates the home file — creating it stays the roles tab's job — so `readRolesFile` gains a `{ create: false }` option that answers the default roles in memory when neither file exists.
- **When the file has no `ask` role.** Defaults are written only when the roles tab creates a new file, so existing files usually lack `ask`. When the roles in effect have no `ask` role, or its entry list is empty, the request uses the built-in default `ask` role's entries (`opencode` `opencode-go/deepseek-v4.1-flash` `medium`, `claude` `claude-haiku-4-5` `high`, `codex` `gpt-6-luna` `high`). An empty `ask` role is treated as unset rather than as "never answer", because an ACP request with zero models could only ever fail. A damaged file falls back to the default roles exactly as the roles tab does.
- **Launching each harness.** `opencode` launches `opencode acp` with the model in `OPENCODE_CONFIG_CONTENT`; `claude` launches `npx @zed-industries/claude-code-acp` with `ANTHROPIC_MODEL` and `CLAUDE_THINKING_EFFORT` — both exactly as `acpLaunchFor` does today. `codex` launches `npx @zed-industries/codex-acp` with `-c model="<model>"` and, when an effort is set, `-c model_reasoning_effort="<effort>"`, codex's own config-override syntax. Any other harness has no ACP adapter: its entry fails at once with `ACP error: no ACP adapter for harness "<name>".` and the next entry is tried. OpenCode's effort is not passed, as today; effort is not sent through the ACP session-config option, because an agent that offers no thought-level option would then fail every attempt.
- **What counts as a model failing.** A model has failed a request when the request settles unanswered from a model-side cause before the model completed any reply turn: the agent failed to start or exited (a fatal connection error), the handshake or prompt returned an error (missing credentials, out of credits, rate limit), or the entry has no adapter. A model has succeeded once it completes a reply turn; after that the request is never retried on another model, so a tool the agent ran is never run a second time, and a later error in the same request is reported normally.
- **What does not trigger fallback.** Refusals (`Usage: ask <prompt>.`, a prompt already running, a remote session still connecting), cancellation (`ACP: prompt cancelled.`), and reset or tab close (`ACP session closed.`) settle the request as today.
- **Order across requests.** Each request tries the tab's current session first, if one is open, then the role's remaining entries in order. A session that failed is closed before the next entry starts, so the tab's session afterwards is whichever model answered, and later prompts reuse it. Falling back starts a fresh conversation on the new model.
- **What the user sees.** Each failed attempt's error stays in the transcript as it is shown today, followed by `ACP: <harness> <model> failed — trying <harness> <model>.`. When the last entry fails too and more than one entry was tried, the request settles with `ACP: every model in the ask role failed.` followed by one `- <harness> <model>: <error>` line per attempt. A single-entry role settles with that entry's own error, unchanged. The last model's session stays open after a prompt error, as any prompt error leaves a viable session today.
- **`startAcp`.** Starts the current session or the first entry that can be launched, skipping entries that fail synchronously (no adapter). Its session is not proven until a prompt gets a reply, so its first prompt still falls back.
- **Removed.** The harness-catalog model choice (`google/gemini-3.1-flash-lite` preferred, else the first OpenCode model) and its `ACP: no opencode model is available in the harness catalog.` refusal are removed. An `ask` role that resolves to no entries cannot happen with the defaults, but is refused with `ACP: the ask role lists no models.`.

## Approach

- `src/plugins/roles/roles-file.ts`: `readRolesFile(home, root, options?)` with `create?: boolean` (default `true`); when false and neither file exists it answers `DEFAULT_ROLES` with source `default` and no problem, writing nothing.
- New `src/acp/ask-role.ts`: pure helpers — `askRoleEntries(root, home = homedir())` reading the role with the default fallback, `attemptOrder(entries, current)`, `describeEntry(entry)`, `fallbackNotice(failed, next)`, and `exhaustedError(failures)`.
- `src/acp/launch.ts`: `acpLaunchForEntry(entry: RoleEntry): AcpLaunch | undefined` for `opencode`, `claude`, and `codex`.
- `src/acp/prompt-state.ts`: `AcpPendingPrompt` gains `replied?: true` and `modelFailed?: true`.
- `src/acp/run-prompt.ts`: `endTurn` sets `request.replied`; the `error` handler sets `request.modelFailed` before settling.
- `src/acp/session-manager.ts`: `session(label, cwd, entry, hooks)` takes a role entry, launches it with `acpLaunchForEntry` (throwing for an unsupported harness), records the entry on the holder, and exposes `entryOf(label)` for the tab's current session.
- `src/acp/manager.ts`: `AcpManager` takes an optional `askModels(root)` resolver (default `askRoleEntries`; the test seam). `run` resolves the attempt order and hands it to a private `attempt` that wraps the pending request's `finish`: on an unanswered, model-failed, unreplied result with entries left, it closes the failed session, appends the fallback notice, and attempts the next entry; otherwise it settles the caller, composing the exhausted error when more than one attempt failed. The connection `onError` hook and the acquire `catch` mark the pending request as model-failed. `start` walks the attempt order.

## Implementation steps

1. `roles-file.ts`: add the `create` option.
2. `ask-role.ts`: role resolution and the pure fallback helpers.
3. `launch.ts`: `acpLaunchForEntry`.
4. `prompt-state.ts` and `run-prompt.ts`: the `replied`/`modelFailed` marks.
5. `session-manager.ts`: entry-based sessions and `entryOf`.
6. `manager.ts`: role-driven `start`/`run` with the fallback chain; remove the catalog model choice.
7. Update tests that construct `AcpManager` (`manager.test.ts`, `plugin-session.test.ts`, `record-feed.test.ts`, `index.test.ts`) to pass a fixed resolver so no test reads the real home roles file, and replace the stale catalog refusal string in `src/commands/ask.test.ts`.

## Tests

- `roles-file.test.ts`: `create: false` with neither file answers the default roles and writes no file.
- `ask-role.test.ts`: the project file's `ask` role wins over home; a role named ` Ask ` matches; a file without `ask` and a file whose `ask` has no entries both use the default ask entries; no file at all uses the defaults and creates nothing; `attemptOrder` puts the current entry first without duplicating it; `exhaustedError` lists every attempt.
- `launch.test.ts`: `opencode`, `claude`, and `codex` entries map to their launches (codex with and without effort); an unknown harness answers undefined.
- `manager.test.ts`:
  - the first prompt launches the role's first entry;
  - a prompt error before any reply closes that session and launches the next entry, appending the fallback notice, and the next model's answer settles the request;
  - a fatal connection error before any reply falls back the same way;
  - an entry with no adapter is skipped without spawning anything;
  - when every entry fails the request settles with the exhausted error listing each attempt;
  - an error after the model completed a reply turn does not fall back;
  - cancellation and reset do not fall back;
  - a later request tries the current session first, then the remaining entries;
  - `start` launches the first entry and reports its model;
  - an empty resolver result refuses with `ACP: the ask role lists no models.`;
  - the harness-catalog resolution cases are replaced by these (new file `src/acp/manager-fallback.test.ts`).

## Out of scope

- Renaming `harness-models.json` or changing its model list (separate backlog issue).
- Adding the `ask` role to existing roles files.
- Monitors, conversations, editor persona queries, and `agent` runs, which keep their own model choices.
- Validating role entries against the harness model catalog.

## Specs and docs

- `product/specs/acp.md`: the "Provider and model" section describes the `ask` role, the default fallback, the per-harness launches, and fallback rules; the lifecycle section notes fallback.
- `product/specs/roles.md`: "Not in this version" no longer says nothing reads the file; the core ACP session reads the `ask` role.
- `help/ask.md`: the summary no longer says OpenCode; a note on the `ask` role and fallback.
- `help/commands.md`: the `ask` row no longer says OpenCode.
- `documentation/user-documentation/command-bar/shell.md`: the ACP paragraph no longer says OpenCode.
- `documentation/user-documentation/advanced-agents/acp-agent.md`: "Before the first prompt" and "Which model it runs" describe the `ask` role and fallback; the remote section's catalog sentence follows.
- `documentation/user-documentation/tab-types/roles.md`: the closing paragraph says the `ask` role is read by `ask`.
