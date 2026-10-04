# Guard slash-prefixed quit and close commands

**Complexity: 3/10** — the shared command-bar classifier already owns the client-side quit and close guard; it needs to normalize the same single leading slash as server command resolution before checking only those destructive command names.

**Goal.** `/quit`, `/close`, and `/exit` in an application command bar receive the same quit or save confirmation as their unprefixed spellings, including `/close <name>`.

**Approach.** Normalize one leading slash for quit/close classification in `classifyCommandBarSubmit`, matching `resolveCommand` while leaving overlay classification unchanged. This closes the path where the server resolves a slash-prefixed built-in after the client has failed to intercept it.

## Implementation steps

1. Normalize the leading slash before quit and close classification, with classifier tests for slash-prefixed `quit`, bare `close`/`exit`, and named `close`.
2. Add shell command-bar integration coverage proving slash-prefixed commands open the quit or save guard without dispatching to the server.
3. Update `product/specs/quit-confirmation.md` and `product/specs/shell-tab.md` to specify slash-prefixed confirmation behavior.
4. Update `help.md` and the user command reference where they describe quit and close confirmation.
5. Run `./scripts/run.mjs check-diff` after each implementation step.

## Tests

- `web/src/shared/command-bar/classify-submit.test.ts`: `/quit` confirms quit; `/close` and `/exit` resolve to the active tab or confirm quitting on the last tab; `/close <name>` resolves the named tab or confirms quitting when it names the last tab.
- `web/src/plugins/shell/ShellTab.test.tsx`: `/quit`, `/close`, and `/exit` open the quit confirmation and are not dispatched; `/close <name>` calls the existing save guard and is not dispatched when the guard accepts it.
- Run the repository's diff-scoped check workflow.

## Out of scope

- Changing server command resolution or the set of commands that accept a leading slash.
- Applying slash normalization to picker/overlay classification or shell-forcing prefixes.
