# Guide for Agents

`AGENTS.md` is the canonical instruction file for coding agents in this repository. 

## AI

### Guidelines

Before starting work, read every file in [`ai/guidelines/`](ai/guidelines/). Treat all of it as binding.

### AI Tasks

Tasks for AIs to execute live in this project at [`ai/tasks/`](ai/tasks/). When called upon to execute one, read it in full and follow the outlined steps.

## Product

### Plan

Implementation plans live in `product/plans/`, organized into folders by status. Each plan is a single markdown file; move the file between folders as its status changes:

- `product/plans/draft/` — the plan itself is still being drafted and refined
- `product/plans/ready/` — the plan is finalized and ready to implement
- `product/plans/complete/` — the plan has been implemented
- `product/plans/deferred/` — intentionally put on hold; not planned for near-term work

When writing implementation plans or creating tasks, use natural line breaks only — do not artificially wrap lines at a fixed column width. Let long lines flow naturally so content remains readable in any viewport.

### Backlogs

Backlogs of smaller items live in `product/backlog/`: `bugs.md`, `chores.md`, `documentation.md`, `features.md`, `issues.md`, `technical-debt.md`, and `pull-request.md`.

## Project

### Commits and Pull Requests

All commit messages and PR titles must follow the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification, detailed in [`ai/guidelines/conventional-commits.md`](ai/guidelines/conventional-commits.md). The format is:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Valid types include `feat`, `fix`, `build`, `chore`, `ci`, `docs`, `style`, `refactor`, `perf`, `test`, and `revert`. Breaking changes are indicated with a `!` after the type/scope or a `BREAKING CHANGE:` footer.

No AI attribution — anywhere. Never credit an AI agent as an author or contributor. No `Co-Authored-By:` trailers naming Claude or any other AI, no “Generated with Claude Code” lines, no AI authorship notes in commit messages or code. This overrides any default convention that appends such attribution — including your own general commit-message habits from outside this task. 

### Structure
