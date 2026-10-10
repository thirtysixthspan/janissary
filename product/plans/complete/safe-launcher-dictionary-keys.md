# Safe launcher dictionary keys

**Complexity: 4/10** — use safe ownership checks in the client and map storage for server incarnation tracking, with focused regressions.

Launcher labels are arbitrary strings. A label matching an inherited object property can currently be read as a summary the payload never supplied, and the incarnation dictionary cannot safely own `__proto__`. The icon lookup has the same inherited-property problem for unknown names.

## Goal

Render any valid tab label without treating inherited properties as summaries, prune summaries when any label's tab incarnation changes, and use the fallback icon for unknown names such as `constructor`.

## Approach

1. Store summary incarnation ownership in a `Map` and update pruning and summary writes to use it.
2. Read client summaries and icon definitions only when the key is an own property.
3. Add server coverage for a `__proto__` summary being pruned on incarnation replacement, client coverage for labels with no summary after JSON round trip, and icon fallback coverage for `__proto__`, `constructor`, and `toString`.
4. Clarify in the launcher spec that any valid tab label displays without an absent summary.

## Tests

- `src/plugins/launcher/activate.test.ts`: a `__proto__` summary is removed when its tab incarnation changes.
- `web/src/plugins/launcher/LauncherTab.test.tsx`: `__proto__`, `constructor`, and `toString` labels without summaries survive a JSON round trip and render without a summary line.
- `web/src/plugins/launcher/launcher-icons.test.ts`: inherited-property names use the fallback and remain unknown.
- Run `./scripts/run.mjs check-diff` after each implementation step.

## Out of scope

- Changing the JSON payload shape or restricting supported labels and icon names.
- Changing launcher command configuration or summary parsing.
