# Identify launcher tabs by plugin namespace and instance key

**Complexity: 3/10** — tighten the shared ownership predicate and add collision regressions for the payload and summarizer.

`isLauncherOwn` currently compares only the instance key. The host looks up plugin tabs by both plugin id and instance key, so another plugin using the key `launcher` is mistakenly excluded.

## Goal

Exclude only the launcher plugin's singleton tab from its payload and summarizer inputs.

## Approach

1. Require both plugin id `launcher` and `LAUNCHER_INSTANCE_KEY` in `isLauncherOwn`.
2. Test another plugin with the same instance key in the shared predicate and activation paths.
3. Update the completed ownership plan to describe the pair as the tab identity.

## Tests

- `src/plugins/launcher/shared.test.ts`: a different plugin using the exact launcher instance key is not classified as launcher-owned.
- `src/plugins/launcher/activate.test.ts`: an undocked collision remains in the payload and summarizer prompt while the launcher's `launcher-2` tab remains excluded.
- Run `./scripts/run.mjs check-diff`.

## Out of scope

- Changing host tab identity or the launcher plugin's instance key.
- Changing runtime behavior beyond ownership filtering.
