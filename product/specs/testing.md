# Automated testing

### Client test isolation

Client tests run with a DOM environment and isolated module state for each test file. The DOM environment is prepared once per worker and reused across its files. Cleanup removes rendered React trees after each test.

### Diff-scoped help tests

When a Markdown file under `help/` changes, the diff-scoped check runs `src/commands.test.ts` in the server project. That test reads the command table and help pages directly, so it covers help changes that Vitest's changed-source dependency detection cannot associate with a test file.
