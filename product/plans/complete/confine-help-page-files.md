# Confine help-page readers to regular files inside the help directory

**Complexity: 3/10** — two small synchronous readers need the same boundary, with focused tests and one behavior-spec clarification.

## Goal

Prevent an `.md` symlink in the help directory from exposing file contents outside that directory through in-app help or generated documentation.

## Approach

Both readers will enumerate only regular `.md` files and resolve candidate paths before reading. A candidate is usable only when its filesystem entry is a regular file, not a symlink, and its resolved path remains inside the canonical help directory. Reads use the validated resolved path. This keeps the help directory as the explicit allow-list for both surfaces.

The runtime reader will preserve its current outcomes: valid pages are returned, an unavailable directory or required `commands.md` stays unreadable, and an existing but unsafe or unreadable page is reported as unreadable rather than exposing its target. The docs reader will omit unsafe entries from its page names and refuse to render a requested name that is not a safe page.

## Implementation steps

1. Restrict `src/help-pages.ts` listing and reads to safe regular files; add an outside-file symlink regression case to `src/help-pages.test.ts` while retaining valid and unreadable coverage.
2. Apply the same regular-file and resolved-path checks in `documentation/.vitepress/command-reference.ts`; make the reader's help directory injectable for tests and add focused coverage to `scripts/command-reference.test.mjs`.
3. Clarify in `product/specs/application-commands.md` that symlinked help entries are not served or published.

## Tests

- Runtime: a valid `commands.md` and an outside target with a `.md` symlink; the target contents are never returned and the symlink is not listed.
- Docs: an outside target with a `.md` symlink; the page name is omitted and direct rendering is refused.
- Keep the existing valid-page, missing-path, unreadable-directory, unreadable-index, and unreadable-page cases passing.
- Run `$janissary/scripts/run.mjs check-diff` after each implementation step and `npm run docs:build`.

## Out of scope

- Changing help-page contents, command behavior, generated page presentation, or the docs sidebar.
- Adding new user-facing documentation for a security boundary that is not currently described there.
