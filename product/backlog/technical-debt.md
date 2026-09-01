# technical-debt

## ready

* Put the plugin architecture's import-boundary lint rules under test the way the client feature zones already are.

Existing Debt: The six restricted-import blocks that encode the whole plugin architecture — plugins may not reach past their API, host infrastructure may import only a manifest, core may reach behavior only through the lazy loader maps, and the client plugin host must not pull a shared contract into the entry bundle — are intricate regexes with negative lookaheads and a type-only exemption, and not one of them is exercised anywhere, while the far simpler feature-zone config beside them has a dedicated test module. Severity: 5/10

Existing Risk: 5/10 - A regex that stops matching — an added directory level, a renamed entry file, a lookahead edited during an unrelated change — silently disables its rule, and the first symptom is a plugin's chunk folded into the entry bundle or a plugin importing host internals, neither of which anything reports.

Proposal Risk: 2/10 - Each rule gains a positive and a negative case, but the cases assert on rule messages, so a block deleted from the exported array altogether is caught only because its own case starts passing where it should fail.

Proposal: `eslint.plugin-boundaries.mjs` exports `pluginBoundaries`, six config blocks spliced into `eslint.config.mjs`, all of them `no-restricted-imports`. `src/eslint-feature-boundaries.test.ts` already demonstrates the technique for testing lint config from vitest: build an `ESLint` instance over the real `eslint.config.mjs`, lint a source string against a synthetic file path with `lintText`, filter the resulting messages by `ruleId`, and pay the config cold start in a `beforeAll` so the first case does not blow the default timeout. Add a sibling `src/eslint-plugin-boundaries.test.ts` filtering on `no-restricted-imports`, with one rejected and one allowed case per block: a server plugin importing a host internal versus `../api.js`, `../files.js`, and the two permitted opener helpers; a client plugin importing `../../ws` versus `../api` and `../shared.css`; `src/plugins/host.ts` importing a plugin's `activate.js` versus its `manifest.js`; a core server module importing `plugins/video/activate.js`; a core web module importing `plugins/video/index`; and the client plugin host importing a plugin's shared contract as a value versus as a type, which is the one case the `allowTypeImports` exemption turns on. Note that these are synthetic sources linted against paths that need not exist, so the cases stay valid as plugins come and go. Repeat the existing test's `beforeAll` warm-up rather than assuming the other module has already paid it, since the two run as separate suites.

## development

## deferred

## declined

* Protect user edits made after a copy-paste before undo deletes its destination in `src/file-navigator/moves.ts`: `undoCopyPaste` records only absolute source and destination paths and unconditionally removes each destination, so editing or replacing a copied file before pressing undo silently deletes the newer content. Record enough identity or content metadata with each copy history entry to detect divergence and surface a conflict instead of removing a changed destination. Severity: **high**. — deferred: complexity 8/10, requires recursive destination identity tracking plus new undo conflict semantics across server history and client conflict handling.

* Stop the sandbox-confinement tests from passing vacuously off darwin in `src/sandbox/index.test.ts`: seventeen cases open with a bare `if (!sandboxAvailable()) return;`, and `sandboxAvailable()` requires `process.platform === 'darwin'` plus `/usr/bin/sandbox-exec`, so on the `ubuntu-latest` runners every job in `.github/workflows/ci.yml` uses, all of them return before their first assertion and are reported as *passing* rather than skipped. Every assertion about the Seatbelt profile the security model rests on — the `-D` param bindings, the secret-deny paths, the credential scrub, the `TMPDIR` override, the offline variant — therefore only ever runs on a developer's Mac, and CI would stay green if the confined path were deleted outright. Convert them to `describe.skipIf(!sandboxAvailable())` (or `it.skipIf`) so a run that cannot exercise confinement reports skips instead of green passes. Severity: **high**. declined: this application is currently limited to running on mac os x.
