# Complete saved host names

**Complexity: 5/10** — ~90 added lines, 7 requirements and 16 scenarios (p=5.57)

## Goal

Work unit 9 of [Hosts Tab](../complete/hosts-tab.md). Depends on [Select and persist the effective hosts file](../ready/hosts-tab-2-host-storage.md), [Resolve saved hosts in remote launch executors](../ready/hosts-tab-4-remote-name.md), [Open SSH tabs using saved names](../ready/hosts-tab-5-ssh-name.md), [Register the Hosts plugin and implement its server commands and intents](../ready/hosts-tab-7-hosts-plugin.md).

## Implementation

- **Tab completion (user decision).** Saved host names are offered as completions after `ssh `, after `on ` in `shell`, `harness`, and `agent`, and after `hosts remove `.

### Completion — `src/completion/`

- Add a pure `completeSavedHost(cursor, names)` in `src/completion/hosts.ts`. Use the normalized command and token boundaries from `src/completion/cursor.ts:3` (`readCompletionCursor`) so slash-prefixed commands and mixed-case keywords work. Offer names only at the sole SSH operand, at the remote selector of the three launch commands, or at argument 2 of `hosts remove`. For SSH, require argument 1 and check that the text after the cursor contains only whitespace. This keeps an SSH invocation with flags, a remote command, or an uncompleted token tail on its ordinary completion path. Skip candidates when the partial name contains literal address syntax.
- For the remote slot, use the existing pure parser entry points with a distinct valid placeholder in the current token position. Verify the placeholder is the actual remote selector, and supply the final `execute` clause and a dummy task when probing the Agent header. Reuse `parseShellArgument` in `src/plugins/shell/parse-argument.ts` to distinguish an `on` consumed as a group name or value. Reuse `parseHarnessCommand` in `src/harness/command-parse.ts:168` so `on` inside its `with` prompt or a removed group clause is skipped. Reuse `parseAgentCommand` in `src/agent/command-parser.ts` so quoted values and task arguments cannot trigger selector completion. Exclude candidate names reserved by a command's selector grammar.
- Follow `completeWord` in `src/completion/helpers.ts:48` for the existing candidate and replacement conventions. Compare host prefixes case-insensitively and keep stored spelling in matches and a unique replacement. For multiple matches, extend the typed prefix only through their shared case-insensitive prefix. Preserve the input when it cannot be extended. Fall through to ordinary filesystem completion when the slot is unrelated or the saved catalog gives no matches.
- Add a trailing optional catalog argument to `completeCommandLine` in `src/completion/index.ts:56`, preserving existing callers. Keep command policy and specialized handlers ahead of the saved-host branch, immediately before filesystem fallback. Supply the catalog from `complete` in `src/controller/completion.ts` using the launch directory and operating-system home from unit 2. Defer the read until saved-host completion needs names. Honor project fallback, use an empty catalog when the effective file is unusable, and use the silent read mode so completion leaves outstanding file problems eligible for later interactive reporting.

## Tests

Extend `src/completion/index.test.ts` with bare SSH, all three remote launch forms, and `hosts remove`. Cover slash-prefix and mixed-case input, stored spelling, ambiguous matches, a literal address, flags or extra SSH words before or after the cursor, `on` inside prompt, task and group text, disabled commands, unrelated positions, and filesystem fallback. In a colocated controller completion test, use temporary config files to verify project replacement, bad-project fallback, unusable-home behavior and silent notification eligibility. Update `product/specs/tab-completion.md` with the supported positions and fallbacks.

## Out of scope

Unrelated argument positions.

## Verification

Run `$janissary/scripts/run.mjs check-diff`. Invoke completion for SSH, each remote `on` clause and `hosts remove` with a seeded catalog.
