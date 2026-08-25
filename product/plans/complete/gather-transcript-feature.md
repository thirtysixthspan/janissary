# Gather the transcript feature into `web/src/transcript/`

**Complexity: 4/10** — a small mechanical relocation of seven production files and their seven colocated tests. The module graph and runtime behavior stay unchanged; only relative import paths change.

## Goal

Place the transcript component, its rendering helpers, intent adapter, scrolling hook, and their tests in a single `web/src/transcript/` feature directory so the feature boundary is visible in the source tree.

## Approach

Move the closed transcript cluster without renaming files or introducing a barrel. Keep imports within the cluster at `./`, adjust dependencies outside it to `../`, and update the four app-shell callers to import the moved public component or hook directly.

## Implementation steps

1. Create `web/src/transcript/` and move the seven transcript source files plus their colocated tests into it.
2. Rewrite relative imports in the moved files: retain `./` for transcript siblings and use `../` for shared root modules such as `ws`, `icons`, `TerminalCard`, and `useXterm`.
3. Repoint `AgentTabBody.tsx`, `InactiveAgentTabBody.tsx`, and `NotificationsTab.tsx` to `./transcript/Transcript`, and repoint `App.tsx` to `./transcript/useTranscriptScroll`.
4. Update the rendering-module path in the Markdown Rendering spec, then remove the resolved backlog item after verification.

## Tests

No new tests: this is a behavior-preserving move. The seven existing colocated transcript suites move unchanged except for import-path rewrites; `check-diff` verifies their execution and all updated import resolution.

## Out of scope

- Moving `useTranscriptSearch.ts` or `TerminalCard.tsx`, which have consumers outside this feature.
- Renaming transcript files, adding interior directories, or adding an `index.ts` barrel.
- Any changes to transcript behavior, help, or user documentation.
