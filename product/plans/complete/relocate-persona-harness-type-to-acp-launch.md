# Relocate the legacy PersonaHarness type from the persona parser to its only consumer

**Complexity: 2/10** — ~5 added production lines, 2 files edited, 6 requirements, 0 test scenarios (p=3.83)

## Goal

The AI personas subplan that introduced the role-directive format required deleting the legacy `PersonaHarness` type, but the parser module still exports it with its harness/model/variant fields. That leaves the role-format parser carrying the old format's type beside it and lets any future caller reintroduce the harness/model/variant coupling the role format deliberately removed. This repair moves the type into the one module that still needs it, `src/acp/launch.ts`, so the persona parser holds only the role-directive parser and the type lives next to the helper that consumes it. No runtime behavior changes.

## Requirements

1. "Define the `PersonaHarness` type locally in src/acp/launch.ts next to `acpLaunchFor`" — `acpLaunchFor` keeps its harness/model/variant parameter shape through a type declared in its own module.
2. "remove its definition and export from src/persona-parsing.ts" — the parser module no longer declares or exports `PersonaHarness`.
3. "drop the now-unused type import there" — the `import type { PersonaHarness } from '../persona-parsing.js'` line leaves `src/acp/launch.ts`.
4. "Leave src/monitor/acp.ts, which now resolves the role through `readRoleSettings` and `acpLaunchForEntry`, untouched" — the monitor ACP spawner file is byte-for-byte unchanged.
5. "Verify with the existing persona and monitor ACP tests, which must keep passing unchanged" — the persona, ACP launch, and monitor ACP test files pass with no edits.
6. "also read src/persona-parsing.ts and confirm only the role prefix and `parseRoleDirective` remain" — after the deletion the parser module contains just the `ROLE_PREFIX` constant and the `parseRoleDirective` function.

## Design decisions

- The type is moved, not duplicated: its sole definition ends up in `src/acp/launch.ts`, and no re-export or alias is left in `src/persona-parsing.ts` (linked to Assumptions 1, 2, and 3).
- The type keeps its exact shape — `harness: 'opencode' | 'claude'`, `model: string`, `variant: string` — and `acpLaunchFor`'s signature and body stay unchanged, so this is a type-only relocation with no runtime effect (linked to Assumption 3).
- `src/monitor/acp.ts` is not edited: it resolves the role through `readRoleSettings` and `acpLaunchForEntry` and never imports the legacy type (linked to Assumption 4).
- No new tests are written. A type-only export cannot be detected by a runtime test, so correctness is pinned by the unchanged existing tests plus a reading-based check (linked to Assumption 5).
- No functional spec, help page, or user/developer documentation is edited: the change alters no user-visible behavior, and no spec or help page describes the legacy type (linked to Assumption 6).

## Preserved behavior

1. `acpLaunchFor` keeps mapping opencode and claude harness inputs to the same command, args, and env — it must not change its returned `AcpLaunch` shape or start throwing for inputs it currently accepts — `src/acp/launch.test.ts` (`describe('acpLaunchFor')`).
2. `acpLaunchForEntry` keeps resolving a role entry through the bundled adapters and internal-tool denial — it must not change its launch output for opencode, claude, codex, or adapter-less harnesses — `src/acp/launch.test.ts` (`describe('acpLaunchForEntry')`).
3. `spawnMonitorSession` keeps resolving the persona's role through `readRoleSettings` and `acpLaunchForEntry` and forwarding no `allowedTools` — it must not start reading a harness shape from the persona — `src/monitor/acp.test.ts` (`launches from the persona role's first entry`).
4. `parseRoleDirective` keeps validating the `[//]: # role:` prefix and throwing the same two error strings — it must not gain harness or tools parsing — `src/personas.test.ts` (`throws the exact missing-directive string`).

## Assumptions

1. `PersonaHarness` is declared and exported only at `src/persona-parsing.ts:1` (`export type PersonaHarness = {`).
2. `src/acp/launch.ts:1` (`import type { PersonaHarness } from '../persona-parsing.js';`) is its only code importer; a repo-wide grep finds every other mention in product plans, backlog, and specs prose, not in code.
3. `acpLaunchFor` at `src/acp/launch.ts:15` (`export function acpLaunchFor(harness: PersonaHarness)`) is the only consumer of the type, and its body reads `harness.harness`, `harness.model`, and `harness.variant`.
4. `src/monitor/acp.ts:5` (`readRoleSettings`) and `src/monitor/acp.ts:6` (`acpLaunchForEntry`) are how the monitor resolves a role; that file has no `PersonaHarness` reference.
5. No test imports `PersonaHarness`; `src/acp/launch.test.ts`, `src/monitor/acp.test.ts`, and `src/personas.test.ts` exercise the affected helpers through their public signatures only.
6. The legacy type and the parser module are not named by any functional spec under `product/specs/` or any page under `help/`, so this type-only move has no user-visible behavior to document.

## Existing functionality

1. The `AcpLaunch` return type that `acpLaunchFor` and `acpLaunchForEntry` already share — `src/acp/launch.ts:8` (`export type AcpLaunch = {`).
2. The `acpLaunchFor` harness-to-launch mapping — `src/acp/launch.ts:15` (`export function acpLaunchFor`).
3. The `parseRoleDirective` role-line parser — `src/persona-parsing.ts:9` (`export function parseRoleDirective`).
4. The role-entry launch path the monitor already calls — `src/acp/launch.ts:39` (`export function acpLaunchForEntry`) and `src/monitor/acp.ts:25` (`const launch = acpLaunchForEntry(entry);`).
5. The colocated tests that pin these helpers — `src/acp/launch.test.ts`, `src/monitor/acp.test.ts`, and `src/personas.test.ts`.

## Implementation steps

1. In `src/acp/launch.ts`, declare a local `type PersonaHarness` next to `acpLaunchFor` with the same three fields and literal union as the old export, and delete the `import type { PersonaHarness } from '../persona-parsing.js';` line. Leave `acpLaunchFor` and its callers unchanged. Build command: `$janissary/scripts/run.mjs check-diff`.
2. In `src/persona-parsing.ts`, delete the `PersonaHarness` type declaration and its export, leaving the `ROLE_PREFIX` constant and `parseRoleDirective` exactly as they are. Do not add a replacement export or re-export. Build command: `$janissary/scripts/run.mjs check-diff`.
3. Run `$janissary/scripts/run.mjs check-diff` and complete the reading-based checks in Verification. Build command: `$janissary/scripts/run.mjs check-diff`.

## UI design

1. No user-visible surface is added or changed. The change moves a compile-time type between two server modules; no component, style, badge, layout, command, flag, or key binding is touched.

## Tests

This plan adds no tests. The change is a compile-time type relocation with no runtime behavior, and no test can detect a stale type-only export. The existing tests in `src/acp/launch.test.ts`, `src/monitor/acp.test.ts`, and `src/personas.test.ts` must keep passing unchanged; correctness is confirmed by the reading-based check in Verification rather than by new tests, tied to Requirements 5 and 6.

## Out of scope

- No runtime behavior changes: `acpLaunchFor`, `acpLaunchForEntry`, and the monitor spawner keep their current logic.
- No edit to `src/monitor/acp.ts` or any other importer — `src/acp/launch.ts` is the only consumer of the moved type.
- No functional spec, help page, or `documentation/user-documentation/` / `documentation/developer-documentation/` edit; those trees are owned by `update-documentation.md`.
- No change to the pull request title or description.
- The other recorded backlog entry — updating editor-suggest test mocks to the role-based `Persona` shape — is a separate work item and is not touched.

## Verification

End with `$janissary/scripts/run.mjs check-diff`. For a reading-based check, open `src/persona-parsing.ts` and confirm it contains only the `ROLE_PREFIX` constant and the `parseRoleDirective` function, with no `PersonaHarness` declaration or export. Open `src/acp/launch.ts` and confirm it declares `PersonaHarness` locally next to `acpLaunchFor`, has no import of that type from `src/persona-parsing.js`, and that `acpLaunchFor` still takes a harness with `harness`, `model`, and `variant` fields. Confirm `src/monitor/acp.ts` is unchanged from its pre-repair state. A surviving `PersonaHarness` export in the parser, a leftover cross-module type import, or any edit to the monitor spawner means the change was not made correctly.
