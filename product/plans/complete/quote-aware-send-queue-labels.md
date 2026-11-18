# Parse send and queue labels with the quote-aware tokenizer

**Complexity: 4/10** — ~15 added production lines across 4 files, 5 behavioral requirements and 7 test scenarios, no new units (p=4.90); two small parser rewrites plus one shared completion helper.

## Goal

`send` and `queue` split their target off with `body.split(/\s+/)`, so a tab whose label (or display alias) contains a space cannot be addressed by either command, even though `tab` can rename and move it and `close` can target it by reading the full remainder. Completion makes this worse: `completeSendTarget` offers a spaced display title without quotes, so the suggestion the UI inserts is one the parsers cannot accept. Both parsers should read the target through the same quote-aware tokenizer the tab command uses, and the completion path should insert a quoted label when the label needs one, so a spaced label is addressable everywhere. Existing usage errors and the way the remaining text is delivered are unchanged. No flags, key bindings, or message wording change.

## Approach

`src/command/quoted-token.ts` owns `readToken` and `skipSpaces`, and `src/commands/parse-tab.ts` already has `readWords`, a loop over those two that tokenizes a whole line into `Token[]` (each token carrying `value`, `start`, `end`). Export `readWords` and reuse it in both parsers: the first token's `value` is the label and its `end` marks where the remaining text begins. Slicing the original body from that offset (rather than re-joining token values) keeps quotes that belong to the text; collapsing whitespace runs with `/\s+/g` preserves the existing "words collapse to one space" delivery behavior. A missing first token keeps each command's existing usage error, and a missing remainder keeps `send`'s `No text to send.` and `queue`'s usage error.

For completion, `src/completion/target-handlers.ts` has `completeTabTarget`, which already handles a partially typed quote, matches against labels, and wraps spaced labels through `formatTarget`. Rename it to `completeLabelTarget` and call it from both `completeTabCommand` and the `send`/`queue` branch of `completeSendTarget`. Keep `close`/`exit` on `completeWord`: their parser reads the full, unquoted remainder as the name, so quoting their suggestion would make it unresolvable. `schedule` completion is a separate handler and stays unquoted.

## Implementation steps

1. In `src/commands/parse-tab.ts`, export `readWords` (change `function readWords` to `export function readWords`). Run `$janissary/scripts/run.mjs check-diff`.
2. In `src/commands/send.ts`, import `readWords` from `./parse-tab.js` and rewrite `parseSendCommand` to read the first token from the body as the label, slice the body from that token's `end` for the text, trim and collapse whitespace, and keep the two existing error returns. Run `$janissary/scripts/run.mjs check-diff`.
3. In `src/commands/queue.ts`, make the same tokenizer change in `parseQueueCommand`, keeping the single usage error for a missing label or command text. Run `$janissary/scripts/run.mjs check-diff`.
4. In `src/completion/target-handlers.ts`, rename `completeTabTarget` to `completeLabelTarget`, update its call from `completeTabCommand`, and have `completeSendTarget` use it for `send`/`queue` while leaving `close`/`exit` on `completeWord`. Run `$janissary/scripts/run.mjs check-diff`.
5. Confirm all four production files stay under the 200-line limit (each is already well under it) and that relative `src/` imports keep their `.js` suffix. Run `$janissary/scripts/run.mjs check-diff` once more with all changes in place.

## Tests

- `src/commands/send.test.ts` — in the `parseSendCommand` block, add a case for a double-quoted multi-word label followed by text, asserting the label is decoded to the spaced name and the text is the remainder.
- `src/commands/queue.test.ts` — in the `parseQueueCommand` block, add the same quoted multi-word label case for a queued command.
- `src/completion/handlers.test.ts` — in the `completeSendTarget` block, add a case asserting that completing a `send` and a `queue` target with a spaced-label candidate inserts a double-quoted label that starts with the typed prefix (both bare and leading-quote prefixes), and a case asserting `close` suggestions stay unquoted. Keep every existing plain-label case green, including the `close`/`exit` ones.

## Spec

- `product/specs/send.md` — update the Tab-completion subsection: completion now quotes spaced labels and the parser accepts a quoted multi-word label, so a spaced title is a valid target.
- `product/specs/command-queue.md` — update the completion sentence the same way for `queue`.
- `product/specs/tab-completion.md` — update the generic-target-completion bullet: `send`/`queue` suggestions are quoted and their spaced targets are accepted; `schedule` remains unquoted and one token.

## Out of scope

- Changing `src/commands/parse-close.ts`, `close`/`exit` parsing, or `completeScheduleTarget` — those commands keep their current behavior.
- Changing target resolution (`byLabelOrAlias`), the usage/error strings, or whitespace collapsing in delivered text.
- Any new command, flag, key binding, or new help page.
