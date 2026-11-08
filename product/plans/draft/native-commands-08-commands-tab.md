# Native commands: Commands tab and command

**Complexity: 5/10** — a new center-only plugin combines command syntax, persistence feedback, accessible table interaction, and live host state.

## Goal

Let users inspect and edit global and native-agent availability in the Commands tab or through the `commands` command.

## Decisions and dependencies

- Depends on the canonical inventory, service, dispatch enforcement, and host topic (work units 1–4 and 7); work units 5–6 precede it in the feature sequence. Server state is authoritative, with a feature-local pure module, hook, and thin components. Follow the Models and Roles patterns without cross-feature client imports.
- The singleton opens or focuses in the center for bare `commands`; it does not dock. It can disable itself, after which a closed tab requires editing the effective `commands.json` file to restore access.
- `commands enable|disable [agent|global] <command>` defaults to global, accepts multiword canonical names and aliases, re-reads before saving, shares the effective file and save-before-apply rules, and can save a child setting under a disabled parent. Success and already-set values are silent. Return exactly `Usage: commands [enable|disable [agent|global] <command>].`, `Unknown application command: <command>.`, `Not a native ACP command: <command>.`, and the service's refusal/write messages for their respective cases.

## Existing code to reuse

`src/plugins/models/`, `web/src/plugins/models/`, `src/plugins/roles/`, `src/plugins/catalog.ts`, server and client literal loader maps, host topic capabilities, and `src/plugins/roles/roles-file.ts` for source and problem presentation.

## Proposed changes

1. Add server and client Commands plugin declarations and literal loader entries, a center-only singleton opener, and an ingress-validated command handler and toggle intents. Declare the new command's canonical metadata and named fixed forms through the inventory contract from work unit 1. Re-read settings on opening, initialize from the current topic snapshot, observe publications, and await edit outcomes. The command handler uses the host service/topic rather than maintaining settings.
2. Render alphabetical command and fixed-subcommand rows, with `Enabled` for all and `Agent access` only for native ACP tools. Use accessible names `Enabled: <command>` and `Agent access: <command>`. Show `Editing <path>` or `No commands file in effect`, file problems and refused edits beneath, `Loading commands…` while loading, and `No commands` for empty inventory. Keep the last successful values on a failed save and disable only its affected toggle while pending.
3. Use native checkboxes and Space activation. Up/Down focus the same toggle on the preceding/following row, using that row's Enabled toggle if the matching toggle is absent; skip unavailable toggles/rows and stop at either end. Dim children disabled by parents and disable both toggles while retaining saved values; show or accessibly expose `Disabled by parent command: <parent>.` Use normal host focus/close behavior, with no Commands-specific Escape action. Keep the table horizontal at every pane width with scrolling when narrow; follow Models spacing, borders, muted rows, and theme colors.
4. Update application commands, tabs, keyboard, and plugin specs plus user-facing help for `commands`, settings files, recovery, and exact command errors.

## Tests

Cover singleton and center placement, bare and edit command forms, normalization, multiword names, syntax and exact errors, self-disable, child edit under disabled parent, project/home selection, refresh, action and intent validation, pending and failed saves, loading/empty/source/problem states, native checkbox names and Space, parent explanation, navigation including skipped controls and fallback, narrow horizontal scrolling, and no special Escape behavior.

## Verification

Run `$janissary/scripts/run.mjs check-diff` and focused plugin host and client tests. Manually open Commands, change both controls, re-enable them, and reopen to confirm persistence using isolated configuration.

## Out of scope

Roles presentation and client command intercept/shortcut enforcement are covered by later work units. No custom commands or per-role overrides.
