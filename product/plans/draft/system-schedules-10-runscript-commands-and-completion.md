# System schedules 10: execute, edit fallback and completion

**Complexity: 5/10**

This connects two user commands and grammar-aware completion to existing file, owner and queue services. The tricky boundaries are exact-file precedence and keeping manual execution free of scheduled naming provenance.

## Goal

Expose immediate runscript execution, existing-script editing, and command completion through the ordinary registry. Source: `product/plans/ready/add-system-schedules.md`.

## Decisions and dependencies

- Dependencies: 02, 03, 04, 05, 06, 08 and 09 for notices, shell availability, script reading, FIFO transport, owner batch serialization and system grammar; 01 supplies `tab focus`. 07 is already complete in filename order and supplies the comparative naming regression, but is not needed to implement edit/execute.
- Register one top-level `execute <name>` definition. It rereads a valid existing project runscript and appends its complete lines to the system queue now, outside any schedule. Use the same serialized batch append/ensure service as 08. It has no system-schedule provenance or firing notice. Shell-start failure uses 02; missing script says `No runscript named "<name>".` and changes nothing.
- Resolve `edit`'s existing file target first through the same cwd/`$root`/home expansion as today; existing exact files always win. Only a bare valid runscript name falls back to `<project>/.janissary/scripts/<name>.rs`. Missing fallback refuses `No runscript named "<name>".` without creating a buffer, file or scripts directory. Explicit paths, filename extensions and `:line` behavior keep the ordinary editor path; callers can intentionally create files using those existing mechanisms.
- The source's out-of-scope sentence saying `edit <name>` creates scripts is stale. The explicit design decision is binding: a missing runscript refuses and creates nothing. The dialog also creates nothing.
- `execute` is a top-level application command; `agent ... execute ...` remains the agent parser's clause and must not be intercepted as a top-level command. Task-picker `execute ...` strings still insert verbatim into bars/harness prompts; no task executor or new agent launch semantics are added.
- Completion offers `system` in the schedule subspace position, system management words, `script` where the system form expects its tail, existing runscript names after `script`/`execute` (and bare edit fallback alongside ordinary file completion), and labels/aliases for `tab focus`. Hidden tabs remain addressable by explicit `in`, `send`, `queue`, `close`, and `tab focus` completion even though nav omits them.

## Existing code to reuse

`commands/edit.ts`, `OpenFileManager.editForCommand`, `expandUserPath`, 04 script reader/catalog, 08 batch append, `src/completion/{cursor,helpers,index,target-handlers}.ts`, `src/controller/completion.ts`, `tab/lookup.ts`, and the registry-generated available/reserved command table. Do not add branches ahead of the command registry.

## File scope

- New `src/commands/execute.ts`, `src/commands/edit-target.ts` (lookup-decision helper with an injected existence probe), `src/commands/{edit,index}.ts`; `src/schedule/system/{runscript-files,owner}.ts` or new `run-now.ts` sharing 08 append serialization; `src/completion/{index,handlers,target-handlers,types}.ts`, new `src/completion/system-schedules.ts`, `src/controller/completion.ts`. `src/open/file-manager.ts` only to share target expansion as a focused extract `src/open/edit-path.ts`, moving its actual importers without a re-export.
- Tests: new `src/commands/{execute,edit-target,runscripts.integration}.test.ts`, `src/completion/system-schedules.test.ts`, `src/schedule/system/run-now.test.ts` if extracted; existing `src/commands/{edit,schedule,resolve,tasks}.test.ts`, `src/{commands,question-command}.test.ts`, `src/completion/{index,handlers}.test.ts`, `src/agent/command-parser.test.ts`, `src/plugins/declaration-validation.test.ts`. `src/controller/completion.test.ts` would be new; controller completion also has existing RPC coverage in `src/index.test.ts`. Include `src/open/file-manager.test.ts` if extracting path expansion. Keep existing plugin reservation coverage for `execute` and `tab` in the declaration tests.
- Specs/docs: `product/specs/{scheduling,editor-tab,tab-completion,application-commands,command-queue}.md`; alphabetical `help.md` rows; `documentation/user-documentation/automation/scheduling.md`, `documentation/user-documentation/command-bar/{commands,tab-completion}.md`, `documentation/user-documentation/tab-types/editor.md`.

## Ordered changes

1. Add `execute` as one registry command with strict argument/name validation and existing missing-script wording. Share whole-run queue append with the owner without fabricating a schedule entry or a notice.
2. Extract/edit target selection at the command layer, preserving direct programmatic editor/profile/link callers. Prefer exact existing file, then existing project runscript for bare names; reject missing fallback before editor/file registration.
3. Thread the server-owned runscript catalog into completion as an optional argument so ordinary completion callers remain compatible. Use grammar-aware positions, not any occurrence of the word `script` inside tab command text. Add `tab focus` completion.
4. Pin registry/agent/task-picker routing boundaries and update help/specs with an example of intentionally creating `.janissary/scripts/morning-checks.rs` as an explicit file path.

## Tests and verification

Test immediate hidden FIFO execution, batch ordering with a firing, unchanged lines after edits, missing script/no created directory/buffer/file, empty script, exact filename precedence, caller cwd/project-root distinctions, `$root`/home/explicit path/`:line` editor regressions, no notice/provenance for execute, shell failure/retry, completion positions/catalog refresh/invalid files, plugin command reservation, and agent clause noncollision.

Run `./scripts/run.mjs check-diff`. Scope E2E uses an actual scratch script containing comment/`pwd`/`false`/`notify after-false`; execute from a visible shell while system stays hidden, reveal with `tab focus system`, inspect output/notification, hide with `close system`, edit the existing script through the editor and execute again. A missing edit/execute must leave the filesystem and open-editor list unchanged. Compare a manually executed clashing harness line with the 07 scheduled-origin test and confirm only the latter suffixes.

## Boundaries

No runscript-creation dialog or implicit script creation, no task-file execution feature, and no source-plan rewrite. Typed/profile behavior and ordinary programmatic editor opens remain governed by their existing contracts.
