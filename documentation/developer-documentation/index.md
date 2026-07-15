# Developer documentation

This section is for contributors working on the Janissary codebase itself — not end users of the app. If you're looking for how to use Janissary, see the [User Docs](/user-documentation/getting-started/application) instead.

Start with `npm start` to run the app and `npm test` to run the test suite. From there:

- [Contributing](/developer-documentation/contributing) — how contributions work: draft plans by pull request, bugs and feature ideas by GitHub issue
- [Documentation](/developer-documentation/documentation) — building and previewing this docs site, and regenerating screenshots
- [Testing](/developer-documentation/testing) — running the test suite
- [Checking changes](/developer-documentation/checking-changes) — the fast diff-scoped loop vs. the full end-of-work gate
- [Code coverage](/developer-documentation/code-coverage) — generating and reading coverage reports
- [Code quality](/developer-documentation/code-quality) — FTA complexity scores and cognitive complexity lint warnings
- [Code duplication](/developer-documentation/code-duplication) — detecting copy-pasted code with jscpd
- [CSS linting](/developer-documentation/css-linting) — stylelint for `web/src/theme.css`
- [Dead code](/developer-documentation/dead-code) — finding unused exports, files, and dependencies with Knip
- [Security checks](/developer-documentation/security-checks) — lint rules, secrets scanning, dependency auditing, and the threat model
- [Linting](/developer-documentation/linting) — ESLint over the full tree or just your changes
- [Commit conventions](/developer-documentation/commit-conventions) — the Conventional Commits format this repo requires
- [Workspace sandbox](/developer-documentation/workspace-sandbox) — how workspaced agent tabs are confined on macOS
