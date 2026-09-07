# Restate the stale architecture principles against the tree they describe

**Complexity: 3/10** — one documentation file, five statements, each checked against a file the statement names. No source, test, spec, or public-documentation change; the whole risk is in getting the replacement facts right rather than in the edit itself.

`ai/guidelines/architecture-principles.md` is declared binding for AI assistants, and its own principle 10 calls stale architecture docs bugs to be fixed on sight. Principles 2, 3, and 5 nevertheless describe a codebase that no longer exists, so the one document that tells an agent where the structural pressure currently sits points it at the wrong file.

## Goal

Every factual claim in principles 2, 3, and 5 is true of the tree as it stands, verified by reading each rewritten sentence back against the file it names. The rules themselves — the binding half — keep their meaning; only the descriptions that justify them are corrected.

## The five stale statements, and what is actually true

| Claim | Reality |
|---|---|
| P2: "per-tab state is scattered across a dozen parallel maps in `Controller` — `shells`, `cwd`, `busy`, `harnessOf`, `acpSessions`, `acpInfo`, `ptys`, `schedules`, `tabDbConns`, `context`, `browsers`, `workspaces`" | `src/controller.ts` declares `managers` and `projectDir` and nothing else; none of those twelve names appear in `src/controller.ts` or `src/controller/`. Per-tab state is on the `Tab` record in `src/tab/types.ts`. |
| P3: `controller.ts` "is now 242 lines" | It is 113. |
| P3: `src/tab/manager.ts` "is the largest non-test source file in the repo and the only one carrying an `/* eslint-disable max-lines */` suppression" | No `max-lines` suppression exists anywhere under `src/` or `web/src/`; the rule is switched off only for test files (`eslint.config.mjs:139`–`:142`). `src/tab/manager.ts` is 247 raw lines; the largest non-test sources are `src/file-navigator/manager.ts` (296), `src/sandbox/index.ts` (290), and `src/plugins/api.ts` (289). |
| P3: lists `page/sync.ts` among the feature modules the controller forwards to | `src/page/` does not exist. The page plugin lives under `src/plugins/page/` and has no `sync` module. |
| P5: the controller-machinery commands "execute in the controller's `runApp`" | No `runApp` exists under `src/`. `CommandManager.executeCommand` (`src/command/manager.ts:114`) looks the name up in the `commands` registry (`src/commands/index.ts`) and awaits its `run`. |

## Design decisions

**Rewrite the descriptions, not the rules.** Each principle is a description (why the rule exists, where the codebase stands) followed by a bolded **Rule**. The descriptions are what went stale. Rule text changes only where it names something that no longer exists.

**Correct `CommandContext` alongside `runApp`.** Principle 5's paragraph and its Rule both name a `CommandContext` type as "the single, narrow controller-facing surface". That type does not exist either — `Command.run` in `src/commands/types.ts` takes `(command, { label, index }, managers)`, where `CommandManagers` is the whole `Managers` registry. Correcting `runApp` while leaving `CommandContext` standing would leave principle 5 describing a mechanism that is still gone, which is the exact failure this item exists to end.

**Name the two registry bypasses rather than a vanished mechanism.** The honest replacement for "execute in the controller's `runApp`" is that every command executes the same way through the registry — *except* `harness` and `ssh`, which `CommandManager.run` matches with inline regular expressions at `src/command/manager.ts:70` and `:79`, ahead of `resolveCommand`, and which have no entry in `coreCommands`. That is a live exception to principle 5 worth stating, not an implementation detail.

**Record sizes as raw line counts, and say so.** `max-lines` counts with `skipBlankLines` and `skipComments`, so no source file is actually over 200 as the rule measures it. Reporting raw counts without that caveat would replace one wrong claim ("this file is the standing exception") with another ("these files are over the limit").

## What already exists (verified against the tree)

| Fact | Where |
|---|---|
| Controller holds `managers` + `projectDir`; five adapters assembled in the constructor | `src/controller.ts:33`–`:50` |
| Per-tab state and its view payloads | `Tab` in `src/tab/types.ts:205` |
| The `runtime` sub-record (`cwd`, `busy`, `context`, `queue`) and its accessors | `TabRuntime` in `src/tab/types.ts:198`; `src/tab/runtime.ts` |
| Payload narrowing instead of non-null assertions | `src/tab/view-guards.ts` |
| Feature modules the adapters forward to | `controller/file-navigator.ts`, `editor/save.ts`, `monitor/window.ts`, `controller/transcript.ts`, `controller/completion.ts` |
| The command registry and its executor | `src/commands/index.ts`; `CommandManager.executeCommand`, `src/command/manager.ts` |
| The two registry bypasses | `src/command/manager.ts:70`, `:79` |

## Implementation steps

1. **Principle 2's opening paragraph.** Replace the dozen-maps sentence with where per-tab state lives now: on the `Tab` record (`src/tab/types.ts`) owned by `TabManager`, with the view discriminant and its five payloads narrowed through `src/tab/view-guards.ts` and the per-tab `runtime` sub-record reached through `src/tab/runtime.ts`. Say what did *not* change: the label-keyed maps moved onto the feature manager that owns each concern rather than disappearing, so there is one owner per resource but still not one owner per agent — which is what keeps the rule live.

2. **Principle 2's Rule.** It forbids a new `Map<label, …>` "on the controller", a place that now holds none. Widen it to the managers it actually needs to constrain, keeping the same instruction.

3. **Principle 3's first paragraph.** Correct 242 → 113, drop `page/sync.ts`, and name the real forwarding targets plus the five adapter factories the constructor assembles.

4. **Principle 3's second paragraph.** Replace the suppression claim and the largest-file claim: no `max-lines` suppression exists under `src/` or `web/src/`, the rule is off only for tests, and the files under the most size pressure are `src/file-navigator/manager.ts`, `src/sandbox/index.ts`, and `src/plugins/api.ts` — with the note that the rule skips blanks and comments, so none is over the counted limit.

5. **Principle 5's paragraph and Rule.** Describe the one execution path that exists: a `Command` carries `name`, `match`, and `run(command, { label, index }, managers)`; `CommandManager.executeCommand` finds it in `commands` and awaits it. Replace `CommandContext` with what the surface actually is, and replace the `runApp` sentence with the two commands that still bypass the registry (`harness`, `ssh`) and where they are matched.

## Tests

No test covers this file, and no source file changes, so there is nothing to assert. Verification is reading each rewritten sentence back against the file it names — the table above is that check, and `./scripts/run.mjs check-diff` confirms the tree is untouched.

## Out of scope

- **Giving `harness` and `ssh` registry entries.** That is its own backlog item; this change only stops principle 5 from describing a mechanism that is gone.
- **Splitting any of the three largest files.** Naming where the pressure sits is the fix; relieving it is not.
- **Principles 1, 4, 6–10**, and the "How to use these" section — none of their claims is falsified by the tree.
- **Mechanically tying any claim to the code.** Nothing enforces these sentences, so the next structural change can restale them; a check that would prevent that is a separate piece of work.
