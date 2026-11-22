# Update user docs for role-backed personas

**Complexity: 1/10** — documentation-only: zero production-code lines or files, six stated doc requirements, no test scenarios or new units (p=2.95); the two user pages are rewritten against existing spec wording.

## Goal

The user documentation still teaches the removed persona web-tools opt-in and the old "each different persona gets its own editor connection" claim. Bring the two affected pages in line with the delivered behavior so a reader is not told to write a directive that now fails, and does not misread a role-shared editor connection.

## Approach

Treat `product/specs/monitoring.md` and `product/specs/editor-tab.md` as the source of truth and rewrite only the corresponding user-facing prose. Keep the user-documentation rules in force: no file paths, function names, or internal class names; commands, directives, error messages, and observable behavior survive. Preserve the surrounding agent-sprite markup and every unrelated paragraph byte-for-byte.

## Implementation steps

1. `documentation/user-documentation/automation/monitoring.md`: replace the "Persona web tools" section and the stale "one narrow exception" sentence near the top with the delivered behavior —
   - a persona file's first line must be `[//]: # role: <role>`, with the rest of the file being its instructions;
   - the role's command grants determine its tools through the same core session pipeline the `ask` and `tell` commands use, with no persona-level web-tools list (point the reader at the roles tab for grants);
   - a leftover `[//]: # tools:` line is ordinary prompt text and grants nothing;
   - a missing or malformed first-line directive fails with the exact message `Persona "<name>": expected first line [//]: # role: <role>.`.
2. `documentation/user-documentation/tab-types/editor-persona-query.md`: correct the "Multi-turn context" connection paragraph so the slot is keyed by the persona's declared role — two personas naming the same role share one connection, personas naming different roles open separate connections, and the connection row keeps naming the persona the user typed — removing the "different persona gets its own connection" claim.
3. Leave both spec files, all source, and all tests unchanged.

## Tests

- No new code tests; this is a documentation-only change and no behavior changes.
- Verify by reading each page against its spec (`product/specs/monitoring.md` and `product/specs/editor-tab.md`) and confirming the wording matches.
- Confirm no old directive (`[//]: # claude:<model>:<variant>`), web-tools allowlist, `web_search`/`web_fetch` opt-in, or "different persona gets its own connection" claim remains in either page.
- Run `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- Any change to source code, tests, `product/specs/monitoring.md`, or `product/specs/editor-tab.md`.
- The pull request description.
- Any other backlog entry.
- Rearranging agent-sprite placement or rewriting unrelated paragraphs on either page.

## Verification

`$janissary/scripts/run.mjs check-diff` after the edits; the tree must remain green.
