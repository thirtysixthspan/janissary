# Dead code

Detect unused exports, files, types, and dependencies with [Knip](https://knip.dev). A single scan covers both `src/` and `web/src/`.

```bash
npm run knip        # full scan — exits non-zero if any dead code is found
npm run knip:fix    # auto-remove unused exports, files, and dependencies, then review the diff
```

## Reading the output

Knip groups findings by category:

```
Unused dependencies (1)
some-package   package.json

Unused files (1)
src/old-feature.ts

Unused exports (3)
helperFn   function   src/utils.ts:12:17
CONSTANT              src/config.ts:5:14

Unused exported types (2)
OldType   type   src/types.ts:42:13
```

Work the categories safest-first: unused dependencies → unused files → unused exports/types.

## Regression gate

`npm run knip` exits non-zero on any finding. Run it alongside `npm run lint` and `npm run test` to prevent dead code from accumulating. Configuration lives in `knip.json`; suppression (`ignoreDependencies`, `ignoreBinaries`) is the rare exception and each entry has a justifying comment.
