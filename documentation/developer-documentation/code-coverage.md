# Code coverage

Generate a merged HTML + LCOV + JSON coverage report:

```bash
npm run coverage
```

Output lands in `coverage/` (gitignored). Open `coverage/index.html` in a browser to browse the interactive report, which breaks down coverage by directory (`src/` vs `web/src/`).

Coverage is enforced with a fixed 90% threshold across all metrics (statements, branches, functions, lines) for both `src/**` (server) and `web/src/**` (client). If a change drops coverage below 90% in any metric for either area, the run fails. Thresholds are stored in `vitest.config.ts` and do not change automatically — the 90% floor is a hard requirement that applies equally to all code.
