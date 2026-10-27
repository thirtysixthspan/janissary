# Preserve partly quoted trailing paths

**Complexity: 3/10** — a focused change to trailing-path interpretation, parser coverage, profile-generated quoting coverage, and the existing file-navigator behavior spec.

## Goal

Only remove quote marks from a trailing path when one matching quote pair encloses the whole path. Paths with quote marks opened or closed within other path text remain verbatim, while fully quoted paths continue to decode as one token.

## Approach

Keep the existing tokenizer and clause parsing unchanged. Before returning a decoded token as the target, confirm that its first matching unescaped closing quote is the final non-whitespace character. Otherwise return the trimmed original target text. This keeps profile-generated paths with escaped double quotes working while preventing mixed quoted and unquoted path text from being silently rewritten.

## Implementation steps

1. Update `src/file-navigator/args.ts` so `targetValue` unwraps only a quote pair enclosing the full trimmed trailing path.
2. Add parser coverage in `src/file-navigator/args.test.ts` for a balanced quote opened mid-word, a fully quoted path with spaces, a multiword unquoted path, and a trailing `in <label>` clause after a partly quoted path.
3. Add a focused `src/profile/files.test.ts` case proving that a profile path containing a double quote is escaped in the generated `files` command.
4. Update `product/specs/file-navigator-tab.md` to state that only a quote pair enclosing the entire trailing path is removed and partly quoted path text remains verbatim.
5. Check `help/commands.md`, `help/files.md`, and user documentation for an existing description of the changed quote behavior; update only if one describes it.

## Tests

- In `src/file-navigator/args.test.ts`, assert `my"folder"` remains the target exactly as typed, a fully quoted path with spaces is decoded, a multiword unquoted path remains unchanged, and `my"folder" in claude` preserves both the path spelling and label.
- In `src/profile/files.test.ts`, assert a path containing a double quote is emitted with the quote escaped inside the generated quoted path token.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step and after the spec update.

## Out of scope

- Changing the shared tokenizer or quote-escape rules for clause arguments.
- Changing profile path quoting or profile launch behavior.
- Changing trailing `in <label>` parsing, path resolution, or help text that does not describe this quote behavior.
