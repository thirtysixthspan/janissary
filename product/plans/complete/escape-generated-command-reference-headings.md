# Escape generated Command Reference headings for help-page names

**Complexity: 3/10** — one Markdown-rendering boundary in the Command Reference generator, focused tests, and a concise behavior-spec update.

## Goal

Prevent a help-page filename from injecting active HTML into its generated Command Reference page while keeping the heading code-formatted, preserving the sprite immediately after it, and leaving the route name unchanged.

## Approach

The generator currently places the raw page name between Markdown backticks. A filename can contain a backtick that closes the inline-code span, after which VitePress parses the remaining heading text as Markdown and HTML. Generate the heading as an HTML `<code>` element with the name escaped for HTML text instead. The existing `escapeHtml` helper encodes HTML metacharacters; the literal backtick then has no Markdown delimiter role. Keep the original name for route lookup and sidebar links, and keep sprite placement after the heading.

Expose the small content-rendering step as a pure helper so a regression test can supply an adversarial name and page body without creating a file in the repository's real `help/` directory. The route-facing `renderCommandPage` remains responsible for allow-listing and reading the actual page.

## Implementation steps

1. Update `documentation/.vitepress/command-reference.ts` to generate an escaped HTML-code heading, retaining the allow-list, raw route identity, and current sprite placement.
2. Extend `scripts/command-reference.test.mjs` with a hostile name containing a backtick and HTML event-handler markup. Assert that the generated heading escapes HTML, cannot form an event-handler element, remains code-formatted, and still puts the sprite after the heading. Retain an ordinary `profile` route-page heading assertion.
3. Update `product/specs/application-commands.md` to specify that generated page headings display HTML characters literally and do not interpret filename markup, while keeping the route unchanged.

## Tests

- Run `npx vitest run scripts/command-reference.test.mjs` for the focused generated-page regression cases.
- Run `$janissary/scripts/run.mjs check-diff` after each change.
- Run `npm run docs:build` and confirm the real `profile` Command Reference route is generated with its code-formatted heading and sprite.

## Out of scope

- Changing help-page filenames, route names, sidebar link construction, or page content.
- Changing which files are eligible for the Command Reference.
- Changing sprite selection or placement.
- Updating public documentation that does not describe this filename-rendering behavior.
