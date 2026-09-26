# Resolve `close <name>` through the shared label-or-alias lookup

## Complexity

2/10 — one command's inline predicate replaced by the existing shared resolver, plus colocated `run` tests; no new module and no wire change.

## Goal

`byLabelOrAlias` in `src/tab/lookup.ts` is the one rule for what a user-typed tab name means: its label or its `rename` alias, ignoring case. `send`, `queue`, `msg`, monitor targets, and `schedule … in <tab>` already resolve through it, but `close`/`exit` in `src/commands/close.ts` still carries its own inline `findIndex` that compares labels only. A user who renamed a tab and types `close <alias>` gets `No tab named "<alias>".`, even though the tabs page of the user guide lists `close`/`exit` among the commands that accept an alias. Route `close <name>` through the shared lookup so every tab-addressing command agrees.

## Approach

In the `tabname` branch of `close`'s `run`, call `resolveTarget(parsed.name, managers, append)` from `src/commands/resolve-target.ts`, where `append` writes the output line to the invoking tab's transcript with the typed command as input. `resolveTarget` already wraps `byLabelOrAlias` and appends the identical `No tab named "<name>".` message, so the not-found reply is unchanged. On a match, close the tab at `managers.tab.findIndex(target.label)`.

`close` inherits the shared first-match rule: when one tab's alias equals an earlier tab's label, whichever the strip holds first closes, exactly as `send` and `queue` already behave.

Update the comments that enumerate the agreeing commands: the one above `byLabelOrAlias` in `src/tab/lookup.ts` gains `close`, and the one above `resolveTarget` names `close` alongside `queue` and `send`.

### Rejected alternative

Calling `byLabelOrAlias` directly in `close.ts` and restating the not-found message. It works, but duplicates the wording `resolveTarget` exists to own.

## Implementation

1. Rewrite the `tabname` branch of `src/commands/close.ts` to use `resolveTarget` and `managers.tab.findIndex`.
2. Update the comments in `src/tab/lookup.ts` and `src/commands/resolve-target.ts`.
3. Run `./scripts/run.mjs check-diff`.

## Tests

`src/commands/close.test.ts` covers only `match` and `parseClose` today. Add `run` cases with a stub `managers.tab` (`tabs`, `append`, `closeTab`, and a `findIndex` over the stub's labels, the shape `src/commands/queue.test.ts` uses):

- `close <alias>` closes the index of the tab whose `rename` alias matches.
- `close <LABEL>` in a different case closes the matching label's index.
- `exit <alias>` behaves the same as `close <alias>`.
- `close <unknown>` appends `No tab named "<unknown>".` to the invoking tab and closes nothing.
- Bare `close` closes the invoking tab's index.

## Spec

`product/specs/tabs.md` (the `close` section): `close <name>` matches the tab's label or its display alias, case-insensitively, instead of the label alone.

## Docs

`help.md`: the `close` row says `close <tabname>` closes a tab by its label or display alias. `documentation/user-documentation/getting-started/tabs.md` already lists `close`/`exit` among the commands that accept an alias; no edit.

## Out of scope

- Tab completion for `close <partial>`, which completes against labels only, as it does for every other target.
- Any change to the first-match rule in `byLabelOrAlias`.
