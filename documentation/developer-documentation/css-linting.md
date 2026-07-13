# CSS linting

Lint `web/src/theme.css` for correctness with [stylelint](https://stylelint.io) + `stylelint-config-standard`. Prettier already handles formatting; stylelint covers correctness conventions (modern color notation, deprecated property values, etc.).

```bash
npm run lint:css        # check for issues — exits non-zero if any are found
npm run lint:css:fix    # auto-fix what stylelint can fix, then review the diff
```

Configuration lives in `web/.stylelintrc.json`. Purely formatting rules (`declaration-block-single-line-max-declarations`, `*-empty-line-before`) are disabled because the stylesheet uses a deliberate compact single-line style that Prettier preserves.
