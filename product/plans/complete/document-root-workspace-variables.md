# Document $root and $workspace in AGENTS.md

**Complexity: 1/10** — no production code, 4 documentation requirements, 1 test scenario (p=2.97)

## Goal

Every process Janissary spawns (a tab's shell, a harness terminal, an agent connection) receives three path variables: `janissary`, `root`, and `workspace` (`withJanissaryHome` in `src/sandbox/environment.ts`, values from `workspacePathEnvironment` in `src/workspace/directories.ts`). `AGENTS.md` already explains `$janissary`, but says nothing about `$root` and `$workspace`, so an agent reading the canonical instructions does not know they exist or what they point at. The issue asks for all three to be documented in `AGENTS.md`.

## Approach

Keep the existing `## \`$janissary\`` section as is (the guidance test pins its heading and content) and add a sibling section right after it, `## \`$root\` and \`$workspace\``, that says:

- `$root` is the project directory Janissary was launched for — the main checkout, not a workspace clone. In a workspaced tab your working directory is a clone, so `$root` is not where you edit.
- `$workspace` is the directory holding that project's workspace clones (`$root/.janissary/workspace`), so `$workspace/<name>` is the clone named `<name>`. The same `$workspace/<name>` and `$root` forms appear in the app's notifications and tab headers, and expanding the variable gives the real path.
- Janissary sets both on every spawn, with or without workspace isolation, replacing any stale inherited value. On a remote tab they are paths on the machine the process runs on. Before a project is initialized, `$root` falls back to the current working directory.
- The variables carry paths, not permissions: a sandboxed workspace still can only write inside its own clone, so do not use `$root` to reach around the sandbox.

The `$janissary` section stays unchanged; the new section opens by naming all three variables together, so the change is purely additive.

Rejected alternative: merging all three into one rewritten "Path variables" section. That would rename the `$janissary` heading the guidance test and existing task prompts refer to, for no gain.

## Implementation steps

1. Add the `## \`$root\` and \`$workspace\`` section to `AGENTS.md` directly after the `## \`$janissary\`` section and before `## Running scripts`.
2. Extend `scripts/agent-guidance.test.mjs` with a test pinning the new section.

## Tests

- `scripts/agent-guidance.test.mjs`: new case "explains $root and $workspace" asserting `AGENTS.md` contains the `## \`$root\` and \`$workspace\`` heading, `$workspace/<name>`, and `.janissary/workspace`.

## Spec and docs

- `product/specs/root-path.md` and `product/specs/sandbox.md` already describe the process environment variables accurately. Add one paragraph to `root-path.md`'s Process environment section noting that `AGENTS.md` explains all three variables to coding agents and that the guidance test pins it.
- `help/` and `documentation/user-documentation/` do not describe AGENTS.md; no change.

## Out of scope

- Changing how or where the variables are set.
- Documenting `JANISSARY_NODE`, `JANISSARY_PLAYWRIGHT`, or the browser endpoint variables, which `ai/guidelines/sandbox-e2e-browser.md` already covers.
- Shipping these instructions into other projects' `AGENTS.md` via `janus init`.
