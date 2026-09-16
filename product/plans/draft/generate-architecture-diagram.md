# Generate architecture diagram

**Complexity: 1/10** — no protocol change, no server or client code, no new npm dependency, no persistence, no UI surface. The two deliverables are a vendored third-party skill (static markdown, HTML, and a handful of standalone Python importers, MIT-licensed) and one new `ai/tasks/` playbook written entirely in prose, both already written to the working tree. The only real risk is drift between a hand-picked component model and the actual codebase on a future run, which the task's own Step 1 and Step 5 self-checks exist to catch.

Janissary has no repeatable way to produce a system diagram of its own architecture — a contributor who wants one draws it by hand or does without. This adds an `ai/tasks/research/` playbook that reads the codebase's own architecture guidance, builds a component model from it, and renders that model as a diagram through a vendored third-party skill, so the diagram can be regenerated on demand as the codebase evolves.

## Design decisions

Settled by the work already done grounding this feature: a vendored skill and a companion task file, both already written to the working tree ahead of this plan.

**The renderer is [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design), vendored whole into `skills/diagram-design/`.** It is a Claude Code skill (MIT-licensed, no runtime dependency) that renders diagrams as self-contained HTML with inline SVG, following an opinionated house style, with a dedicated `references/type-architecture.md` reference for "components + connections in a system." It does not parse code itself — the calling task still has to read the codebase and hand it a component model.

**Only the skill directory is vendored, not the rest of the upstream repo.** Upstream ships `commands/`, `prompts/`, `.agents/`, `.claude-plugin/`, `.codex-plugin/`, `.factory-plugin/` for standalone plugin/marketplace distribution across several agent tools. Janissary already has its own `skills/<name>/SKILL.md` convention (`skills/perplexity-search/`, `skills/ask-user/`, `skills/agent-merge-changes/`), so only `SKILL.md`, `references/`, `assets/`, `scripts/` were copied in.

**License compliance travels with the vendored copy.** Upstream's `LICENSE` (MIT) is copied alongside the skill; its `THIRD_PARTY_LICENSES.md` is copied in trimmed form, re-pathed to the vendored layout and stripped of two entries that named an upstream build-source directory (`scripts/vendor/icons/`) this vendored copy does not include — the icon content itself is inlined in `references/primitive-icons.md` and `assets/icons.html` regardless, so the attribution stays accurate to what actually ships.

**The task lives at `ai/tasks/research/generate-architecture-diagram.md`, matching the shape of `find-technical-debt.md` and `find-namespaces.md`.** Both read the codebase with judgment and write one artifact; this task follows the same Step 0 (clean-tree prepare), Step-ordered structure, and `quick-commit.md` ending, but its artifact is a diagram file instead of a backlog entry.

**The task grounds its component model in `ai/guidelines/architecture-principles.md` and `CLAUDE.md`'s project structure, rather than re-deriving architecture from a raw file walk**, then checks that guidance against the current tree so a stale principle does not silently produce a stale diagram.

**Every one of the skill's own interactive gates (style-guide onboarding, confirm-before-drawing) is pinned to a fixed choice**, since the task must run unattended: shipped default style guide, no onboarding, no pause.

**Default diagram type is Architecture** (`references/type-architecture.md`), with a named escape hatch to `type-dependency.md` or `type-uml-class.md` only when the run's own analysis concludes one of those tells the more useful story that run.

**Output is one file, regenerated in place, not an append-only history.** `documentation/diagrams/architecture.html` is overwritten every run — the diagram is a snapshot of "the architecture as read today," the same pattern `take-documentation-screenshots.md` uses for its PNGs.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The architecture facts the diagram is built from | `ai/guidelines/architecture-principles.md` |
| The top-level directory map | `CLAUDE.md`, "Project structure" |
| The project's own skill convention this vendoring follows | `skills/perplexity-search/SKILL.md`, `skills/ask-user/SKILL.md`, `skills/agent-merge-changes/SKILL.md` |
| The read-then-produce-one-artifact task shape this playbook follows | `ai/tasks/research/find-technical-debt.md`, `ai/tasks/research/find-namespaces.md` |
| The regenerate-in-place artifact pattern | `ai/tasks/take-documentation-screenshots.md` |
| The commit-and-push ending every step above shares | `ai/tasks/workspace/quick-commit.md` |
| The diagram renderer itself, vendored whole | `skills/diagram-design/SKILL.md`, `references/type-architecture.md`, `references/type-dependency.md`, `references/type-uml-class.md` |

## Proposed changes

**`skills/diagram-design/`** — already vendored: `SKILL.md`, `references/` (56 files, 40 of them one per visual type, the rest semantic-pattern and cross-cutting docs), `assets/` (165 style-guide examples and templates), `scripts/` (the `drawio_extract.py` / `excalidraw_extract.py` / `mermaid_extract.py` / `self_check.py` importers), `LICENSE`, and a re-pathed `THIRD_PARTY_LICENSES.md`. A plain directory copy — no build step, no `npm install`, so it does not touch `security/known-malicious-packages.json` or its gate.

Vendoring the full `assets/` and `references/` sets, rather than trimming to only the architecture/dependency/UML-class paths this task uses, was considered and rejected: `SKILL.md`'s own routing (§3's visual-type table, §4's anti-pattern examples, the style-guide gate in §0) links across the whole reference set regardless of which diagram type a given run draws, and the shipped style guide's worked quality is defined against the full example corpus in `assets/`. Trimming would leave those cross-links dangling for any run that isn't an architecture diagram, in exchange for a few MB of disk — not a trade this plan's goal calls for.

**`ai/tasks/research/generate-architecture-diagram.md`** — already written: an eight-step playbook covering workspace prep, reading the codebase's own architecture account and checking it against the tree, building a bounded component/connection model, loading the vendored skill with every interactive choice pinned, rendering and saving `documentation/diagrams/architecture.html`, verifying the diff is scoped to that one file, committing and pushing via `quick-commit.md`, and reporting.

**`documentation/diagrams/`** — a new directory, created the first time the task actually runs; not created by this plan itself.

## Tests

No automated test coverage applies: nothing under `src/**/*.test.ts` or `web/src/**/*.test.tsx` is touched, since this plan adds no application code — only a vendored skill (markdown, HTML, standalone Python importers with no test harness of their own) and one prose task playbook. Correctness is instead checked by actually running the task once end to end, per Verification below, and by the task's own internal self-checks (Step 5 of `generate-architecture-diagram.md`: the diff is scoped to exactly one file, and the produced HTML is well-formed with an inline `<svg>`).

## Out of scope

- **Building a code-parsing or AST-based architecture extractor.** The task relies on an agent's own reading of the code plus `ai/guidelines/architecture-principles.md`, not on static analysis tooling.
- **Editing the vendored skill's shipped style guide or branding.** The task forbids triggering the skill's onboarding flow; Janissary ships the skill with its default editorial skin.
- **Wiring the generated diagram into the VitePress documentation site's navigation** (`documentation/developer-documentation/index.md` or the site build). It stays a standalone HTML artifact under `documentation/diagrams/` for now.
- **Any of the upstream plugin-distribution scaffolding** — `.claude-plugin/`, `.codex-plugin/`, `.factory-plugin/`, `.agents/`, `commands/`, `prompts/` — none of which Janissary's own `skills/` convention uses.
- **Diagram types beyond what one task run needs.** The vendored skill carries 40 visual types; only the architecture/dependency/UML-class references are named as this task's choices.

## Verification

No `check-diff` applies — no `src/` or `web/src/` file changes. Instead:

```
git status --short
```

should show only `skills/diagram-design/`, `ai/tasks/research/generate-architecture-diagram.md`, and this plan as new paths before the task is ever run.

Then run `ai/tasks/research/generate-architecture-diagram.md` once, end to end, and confirm: `documentation/diagrams/architecture.html` is created, is well-formed HTML with an inline `<svg>`, and reads as a recognizable, accurate snapshot of the current `src/`/`web/src/` split and manager registry — not a stale or generic diagram; the run's own `git status --short` after its drawing step shows only that one new file; no application source, spec, or backlog file is touched; and none of the skill's interactive gates surface (no prompt, no `references/style-guide.md` edit, no profile written under `~/.diagram-design/`).
