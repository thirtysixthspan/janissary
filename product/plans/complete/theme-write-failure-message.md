# Theme write failure message claims a change that did not happen

**Complexity: 2/10** — three reply strings in two command modules, their tests, one spec sentence in two specs, and one user-documentation paragraph. No behavior of the config module changes.

## Bug

When `theme <name>`, `theme sync`, or `syntax theme <name>` cannot write `.janissary/config.json`, the reply reads `Theme set to "<name>" for this session (config write failed — won't persist).` (or `Syntax theme set to …`). Nothing changes for the session: the running app keeps the old theme, so the only signal the user gets tells them the opposite of what happened.

## Root cause

`updateConfig` in `src/config.ts` updates the in-memory config only after the atomic write succeeds, and returns false without touching it when the write fails. That ordering was introduced deliberately by the transactional-config change (`product/plans/complete/validate-application-config.md`, PR #840), which moved the in-memory assignment from before the write to after it so a failed write could no longer leave live state diverged from disk. The reply strings in `src/commands/theme.ts` (`setTheme`, `syncSyntaxTheme`) and `src/commands/syntax.ts` were written for the earlier behavior and were never updated, so they still promise a session-only change.

## Correct behavior

`product/specs/application-config.md` is explicit: "If the write fails, the file and running setting both keep their previous value and a warning reports the failure." The bug report accepts either applying the change for the session or saying the theme did not change. Of the two, only the second agrees with the spec and with the rollback that PR #840 made on purpose, so the setting stays as it was and the reply says so: `Could not save theme "<name>" to .janissary/config.json — theme unchanged.`, and `Could not save syntax theme "<name>" to .janissary/config.json — syntax theme unchanged.` for `syntax theme <name>` and `theme sync`. The wording follows the existing `theme sync` no-match reply, `… — syntax theme unchanged.`

## Reproduction

In `src/commands/theme.test.ts` and `src/commands/syntax.test.ts`, load the config into a temp directory, remove its `.janissary/` directory so the write fails, then run `theme dracula`, `theme nord` + `theme sync`, and `syntax theme nord`. Observed on `master`: each reply was `… set to "<name>" for this session (config write failed — won't persist).` while `getConfig().theme` stayed `dark` and `getConfig().syntaxTheme` stayed `github-dark`, the values the next state event publishes to the client.

## Approach

Change the three failure-branch strings to state that the save failed and the setting is unchanged. Leave `updateConfig` as it is.

## Implementation steps

1. `src/commands/theme.ts`: replace the failure strings in `setTheme` and `syncSyntaxTheme`.
2. `src/commands/syntax.ts`: replace the failure string.
3. Tests (already written test-first): the three cases in the Regression test section below.
4. Specs: in `product/specs/application-themes.md` and `product/specs/application-commands.md`, state that a failed config write leaves the theme unchanged and the reply says so.
5. Docs: rewrite the write-failure paragraph under `## theme` in `documentation/user-documentation/command-bar/commands.md` so that it quotes the new reply and drops the explanation that the old message was misleading.

## Regression test

- `src/commands/theme.test.ts`: `reports the theme unchanged when the config write fails` and `theme sync reports the syntax theme unchanged when the config write fails`.
- `src/commands/syntax.test.ts`: `reports the theme unchanged when the config write fails`.

Each asserts both the new reply and that the in-memory setting kept its previous value. All three fail on `master` because the reply claims a session change.

## Out of scope

- Applying the change for the session despite a failed write, which would reverse the rollback that `application-config.md` specifies.
- Any other caller of `updateConfig` (there are none today) and the `config.json` write path itself.
