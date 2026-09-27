# Keep the whole name typed for `agent <name>`

**Complexity: 1/10** — `nameFrom` in `src/agent/commands.ts` stops slicing the typed name to `tabNameMaxLength`. The tab strip already shortens long labels for display. No client, protocol, or launch-check change.

## Bug

From `product/backlog/bugs.md` (first `## ready` entry): "Keep the whole name a user typed for `agent <name>`, instead of cutting it to the tab strip's display length". `agent alpha-bravo-charlie` opens a tab labelled `alpha-bravo-char`, cut to 16 characters with no ellipsis, and that clipped text becomes the tab's identity. `close alpha-bravo-charlie` then finds no tab, and `agent alpha-bravo-charlot` is refused because `alpha-bravo-char` is already open.

## Reproduction

Failing tests added before the fix, run with `npx vitest run --project server src/commands/agent.test.ts src/launch-name/local.test.ts` against `master`:

- `resolveAgentName('agent Alpha-Bravo-Charlie', ['janus'])` returned `alpha-bravo-char` instead of `alpha-bravo-charlie`.
- `parseAgentCommand('agent Alpha-Bravo-Charlie')` returned `name: 'alpha-bravo-char'` instead of `alpha-bravo-charlie`.
- `parseAgentCommand('agent alpha-bravo-charlie').name` returned `alpha-bravo-char`, so the second typed name `alpha-bravo-charlot` would clip to the same label and collide with the first.

## Root cause

`nameFrom` ends with `.toLowerCase().slice(0, getConfig().tabNameMaxLength)`. `tabNameMaxLength` is the tab strip's inactive *display* budget, which `truncateTabLabel` in `web/src/tab-label.ts` applies at render time with a trailing `…`. Applying it again to the stored label turns a display limit into an identity limit. Both `parseAgentCommand` and `resolveAgentName` build the label from `nameFrom`, so the launch check, the workspace folder, the state file, routing, and refusals all see the clipped name.

## Correct behavior

Per `product/specs/tabs.md`, "`agent <name>` creates a tab with the given name (always lowercased)", and a name longer than its display limit "is shortened with a trailing `…`" only in the strip. `agent alpha-bravo-charlie` opens a tab labelled `alpha-bravo-charlie`. The strip shows it in full while focused and as `alpha-bravo-cha…` when not. Names that share their first 16 characters stay distinct.

## Approach

Drop the `slice` from `nameFrom` and its now-unused `getConfig` import. A `harness <name> as <label>` label is already uncapped, so agent labels now match it. No separate hard cap is added.

## Implementation steps

1. `src/commands/agent.test.ts`: replace the two "truncates … to the configured max length" cases with cases asserting `agent Alpha-Bravo-Charlie` resolves and parses to `alpha-bravo-charlie`.
2. `src/launch-name/local.test.ts`: add a case where an open tab carries the label parsed from `agent alpha-bravo-charlie`, and `agent alpha-bravo-charlot` goes ahead under its own label with no refusal.
3. `src/agent/commands.ts`: remove the `slice` and the `getConfig` import.
4. Run `./scripts/run.mjs check-diff`.

## Regression test

- `src/commands/agent.test.ts` — "keeps the whole lowercased name past the tab strip display length" (under both `resolveAgentName` and `parseAgentCommand`).
- `src/launch-name/local.test.ts` — "keeps two typed names apart when they share their first 16 characters".

All three fail on `master` and pass with the fix.

## Verification

Live end-to-end check in a scratch instance with the attached browser: a driver runs `agent alpha-bravo-charlie --no-workspace` in the root `janus` tab, then reads the strip. It expects the focused tab to read `alpha-bravo-charlie` and, after switching back to `janus`, the unfocused tab to read `alpha-bravo-cha…`. It then runs `agent alpha-bravo-charlot --no-workspace` from `janus` and expects a second tab rather than a refusal. `--no-workspace` keeps the check free of a clone, which the fix does not touch. Finally, `close alpha-bravo-charlie` from `janus` is expected to close the first tab by its typed name.

Result: the strip read `alpha-bravo-charlie [active]`, then `alpha-bravo-cha…` once `janus` was focused. `agent alpha-bravo-charlot` opened a third tab with no notification, and `close alpha-bravo-charlie` closed the first tab, leaving only `alpha-bravo-charlot.json` and `janus.json` in the scratch state directory.

## Specs and docs

- `product/specs/application-config.md`: `tabNameMaxLength` no longer limits agent or harness labels at creation; it is a display limit only.
- `documentation/user-documentation/getting-started/startup.md`: drop "This also limits new agent names" from the `tabNameMaxLength` row.
- `product/specs/tabs.md`: state under `agent <name>` that the whole name is kept and only the strip shortens it. `help.md` does not mention the limit.

## Out of scope

- A separate hard cap on agent labels.
- Changing `truncateTabLabel` or the display limits.
