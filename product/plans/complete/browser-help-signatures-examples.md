# Browser help signatures and examples

Complexity: 1/10

## Goal

Make the browser command help page describe every supported command form and show examples that open a browser window before navigating to a URL.

## Approach

Use the browser parser and manager as the authority for command syntax and behavior. Keep the change to the existing help page and the browser behavior spec; the public browser guide already documents the supported forms accurately. No runtime behavior changes, so existing parser and manager tests plus a direct comparison of the help page provide the relevant verification without adding a wording-only test.

## Implementation steps

1. Rewrite the Usage section in `help/browser.md` with all supported forms: `open [name] [--headed|-H]`, `list`, `use <id>`, `goto <url>`, `eval <js>`, `shot`, `content`, `close [id]`, and `window close <id>`.
2. Explain that `open` creates a window while `goto` navigates, remove the unsupported screenshot name argument, and use valid examples for navigation, content, window selection, and closing.
3. Update `product/specs/browser.md` to record that browser help lists the supported forms and demonstrates valid window creation, navigation, and screenshot usage.
4. Compare each signature and example with the parser, browser manager, and their existing tests. Run the focused browser command and manager tests and `$janissary/scripts/run.mjs check-diff`.

## Tests and verification

No new automated tests are needed because this change does not alter command behavior and the existing browser parser and manager tests cover the forms and actions. Run `npm run test:server -- src/browser/command.test.ts src/browser/tab.test.ts`, inspect each help signature and example against those cases and the source, and run `$janissary/scripts/run.mjs check-diff` after each implementation change.

## Out of scope

- Changing browser command parsing or behavior.
- Adding a test that only snapshots help-page wording.
- Changing the already-accurate public browser guide or unrelated command documentation.
