# Escape help-page names in the Command Reference sidebar

**Complexity: 2/10** — one string-escaping boundary, one focused test, and a short behavior-spec update.

## Goal

Prevent a help-page filename from injecting active HTML into the generated Command Reference sidebar while keeping the original page name as its route ID.

## Approach

VitePress renders sidebar `text` as HTML. Treat page names as untrusted text and HTML-escape them before placing them inside the fixed `<code>` element. Keep the unmodified name in the route link. Let the sidebar builder accept an optional page-name list, defaulting to the real directory listing, so a regression test can exercise crafted names without changing files in `help/`.

## Implementation steps

1. Escape HTML-sensitive characters in each sidebar label in `documentation/.vitepress/command-reference.ts`; preserve the raw page name in its route link.
2. Add a focused test for a filename such as `<img src=x onerror=alert(1)>.md`, and for an ordinary `profile` label. Check that the malicious label is escaped, the ordinary label remains code-formatted, and both links retain their original route names.
3. Update `product/specs/application-commands.md` to state that Command Reference labels display page names as text and retain their corresponding routes.
4. Remove the resolved issue from `product/backlog/pull-request.md`, promote this plan to `complete/`, and publish the changes on the existing PR branch.

## Tests

- Focused sidebar test in `scripts/command-reference.test.mjs`.
- `$janissary/scripts/run.mjs check-diff`.
- `npm run docs:build`.

## Out of scope

- Rejecting help-page filenames or changing the set of generated routes.
- Changing the names used as route IDs.
- Changing other sidebar entries, generated command pages, or VitePress configuration.
- Updating public help or user documentation that does not describe this filename-handling behavior.
