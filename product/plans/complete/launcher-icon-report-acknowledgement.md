# Report unknown launcher icons after acknowledgement

Complexity: 5/10

## Goal

Report unknown launcher icon names after a committed render and remember only reports the host accepted.

## Approach

Keep icon rendering pure in the command rail. Add a launcher-owned hook that deduplicates unknown names, tracks in-flight and accepted reports for one mounted launcher, and retries a failed name only after activation or a command-list change. Ignore completions after unmount.

## Implementation steps

1. Remove the module-wide report cache and reporting callback from the command row and list.
2. Add a colocated hook that gathers distinct unknown icons and reports them from an effect, recording success only after the intent promise resolves.
3. Wire the hook from `LauncherTab` and cover acknowledged reports, rejected-report retry, duplicate names, and unmount behavior.
4. Update the launcher spec to describe when an unknown icon is reported and retried.

## Tests

- Update `web/src/plugins/launcher/LauncherTab.test.tsx` to await effect-driven reporting and cover retries and duplicate icon names.
- Run `./scripts/run.mjs check-diff` after the implementation and spec changes.

## Out of scope

- Changing the icon vocabulary, fallback glyph, command dispatch, or launcher configuration format.
