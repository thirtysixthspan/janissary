# Make harness usage errors show their angle-bracket placeholders

**Complexity: 2/10** — one small helper and five call sites in a single source file, plus the exact-string assertions the parser's tests already pin. The care is in where the escaping goes: the message, not the renderer, is what marks a `<placeholder>` as text.

## Root cause

Every `Usage: …` error `parseHarnessCommand` returns is replied into the transcript as a markdown line, so it is rendered by `renderMarkdown` in `web/src/shared/transcript/markdown.ts` — directly on an agent tab, and on a shell tab through `insertMarkdownBlock` in `web/src/plugins/shell/markdown-block.ts`. `marked` tokenizes a bare `<label>` as raw HTML; `DOMPurify.sanitize` then keeps it, because `<label>` is a real element it allows, and the block ends up holding an empty `<label>…</label>` pair around the sentence with no visible placeholder. A `<name>` it does not allow is removed outright. Either way the reader sees `Usage: harness <claude|opencode|codex> as .` and `Usage: harness capture .` — the tokens are still in the string, but they are gone from what is drawn. `[options]`, `[-w]` and `[as` survive, which is why only the angle-bracket tokens disappear.

## Correct behavior

`product/specs/harness.md` already words these errors — `Usage: harness <claude|opencode|codex> as <label>.` and `Usage: harness capture <name>.` — and the user is to read them exactly that way, on a shell tab and on an agent tab alike. The same covers the other four that travel the same path: `Usage: harness <claude|opencode|codex> --model <value>.`, `--effort <value>.`, `[options] with <prompt>.`, and the bare `harness` form's `[as <label>] [-w] [-y].`

## Reproduction

Typed on a fresh launch in the `janus` shell tab's command bar, `harness claude as` and `harness capture` each answer with the placeholder missing from the line the tab draws. Encoded as a test before the fix, rendering the reply the shell tab actually receives through `insertMarkdownBlock`:

- `web/src/plugins/shell/markdown-block.test.ts` › "draws the placeholders of a usage error as visible text" fails with `Usage: harness <claude|opencode|codex> as .`
- `web/src/plugins/shell/markdown-block.test.ts` › "draws the placeholder of a subcommand usage error as visible text" fails with `Usage: harness capture .`

## Approach

Escape the angle brackets in the usage strings themselves, so every markdown renderer that shows one prints the placeholder instead of reading it as an element. `marked` turns a `\<` back into a `<` — in HTML output it becomes `&lt;`, and in the shell tab's ANSI fallback (`markdown-to-ansi.ts`) it is an `escape` token whose text is the character — so a single escaping in the message reaches both renderers and the transcript's at once. The renderer is left alone: a reply that legitimately carries raw HTML (a link, a table) keeps rendering as it does today, which a broad escape or an always-on ANSI fallback would have changed.

Rejected: escaping inside `renderMarkdown` or `insertMarkdownBlock`, which cannot tell a usage string from any other reply; and routing shell-tab replies through `markdownToAnsi` unconditionally, which fixes a shell tab and leaves the agent tab's transcript showing the same line without its placeholder.

## Implementation steps

1. `src/harness/command-parse.ts`: a `usage(body)` helper that prefixes `Usage: ` and escapes `<` and `>`, used by the five error strings built by `findFlagValue`, `splitWithClause`, `parseHarnessFlags`, `parseLabelSubcommand`, and `parseHarnessCommand`.
2. `src/harness/command-parse.test.ts` and `src/harness/index.test.ts`: update the assertions that pin those strings exactly, and add one asserting the escaped form of `harness claude as`.
3. Tests added in step 1 of the reproduction, plus a `renderMarkdown` case pinning both halves: the escaped placeholder renders as text, the bare one is read as HTML and loses it.

## Regression test

`web/src/plugins/shell/markdown-block.test.ts` › "draws the placeholders of a usage error as visible text" and "draws the placeholder of a subcommand usage error as visible text", which render the parser's own reply through the shell tab's block and assert the line reads as the spec words it. `web/src/shared/transcript/markdown.test.ts` › "renders escaped angle brackets as text" pins the renderer half.

## Verification

`./scripts/run.mjs check-diff` passes clean, including the new regression tests. Live: the fix was built, a scratch instance was started against `./temp/fix-a-bug/` with its own `HOME`, and `./temp/fix-a-bug-drivers/verify.mjs` typed the reported commands into the `janus` shell tab's command bar and read back what the tab drew.

Outcome: verified. Each reply was drawn with its placeholder present — `Usage: harness <claude|opencode|codex> as <label>.`, `Usage: harness capture <name>.`, `Usage: harness <claude|opencode|codex> --model <value>.` and `Usage: harness <claude|opencode|codex> [options] with <prompt>.` — and the tab strip stayed at the one `janus` shell tab throughout, so no usage error opened anything.

## Spec and docs

- `product/specs/harness.md`, "Custom tab label (`as <label>`)": a sentence recording that a usage error is shown with its `<placeholder>` tokens intact wherever the reply is rendered.
- No user-documentation change: `documentation/user-documentation/advanced-agents/harness.md` already words the errors the way the fix makes them read, and `help.md` does not describe them.

## Out of scope

- The usage errors of the other commands (`db sqlite query <name> <sql>`, `play <file>.`, `monitor ask <name> <question>`, …) whose placeholders are dropped by the same renderer. Same cause, different message sources; this fix is the harness command's.
- Any change to the renderers.
