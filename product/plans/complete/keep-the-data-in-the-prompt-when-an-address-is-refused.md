# Keep the data in the prompt when an address in the message is refused

`chatPrompt` substituted `context.sourceNote` for the whole `## The data` section, and `addressIn` matched any run beginning with a slash wherever it appeared. A message like "plot revenue/employee by region" therefore produced the address `revenue/employee`, `parseSource` refused it, and the model was shown the refusal *instead of* the data — no columns, no row count, no sample for the source the user had named one message earlier. It could not draw anything, and it said so; the user was told their question could not be answered for a reason that had nothing to do with the question, and the fix ("revenue per employee") was not discoverable from anything on screen.

Two changes, one for each half:

- `chatPrompt` in `src/visualizations/prompts.ts` renders the note as a line above the datasets, so `## The data` always carries what is actually held. The refusal still reaches the model before the next reply, so the same recovery advice is still delivered — what goes is the data being thrown away to make room for it.
- `ADDRESS` in `src/visualizations/source.ts` now requires the address to begin at a word boundary (`(?<![A-Za-z0-9_])`). A slash in the middle of a word is a ratio as often as a separator, and no real path in a sentence starts that way; a path at the start of the line, after a space, or inside brackets is unaffected, as is a URL wherever it falls.

The spec gains a sentence saying an address begins where a word begins, because the behaviour is visible to anyone whose question contains a ratio.

`src/visualizations/prompts.test.ts` replaces the case that pinned the old substitution with one asserting the note and the columns both appear, and that the note comes first. `src/visualizations/source.test.ts` gains a describe block covering a URL in a sentence, a path at a word boundary in four positions, the two ratios that are not addresses, and a sentence with no address in it.
