# Native commands: completion filtering

**Complexity: 3/10** — the existing completion engine needs policy-aware filtering for names and fixed forms.

## Goal

Hide disabled application commands and subcommands from host completion while retaining their help entries.

## Decisions and dependencies

- Depends on inventory, settings, and server enforcement (work units 1–4). Use the same canonical metadata and effective parent settings as dispatch, including aliases and the selected command owner. Preserve existing completer semantics for arguments, paths, and explicitly requested shell execution.
- No client-owned policy list; plugin completion capabilities use the host completion path.

## Existing code to reuse

`src/controller/completion.ts`, `src/completion/`, command-specific completers, `src/commands/index.ts`, and the policy service introduced earlier.

## Proposed changes

1. Pass policy-aware availability into command and relevant fixed-subcommand completion while keeping argument completion intact and preserving existing order and formatting.
2. Update `product/specs/tab-completion.md` and command specifications to explain that help retains disabled commands while completion hides them.

## Tests

Test disabled top-level entries, disabled child and parent, enabled siblings, canonical aliases, owner-specific shared names, argument completions, plugin completion calls, and unchanged help and shell completion behavior.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and focused completion and command tests.

## Out of scope

Agent allow-lists, editing controls, and browser-side intercepts are handled in later work units.
