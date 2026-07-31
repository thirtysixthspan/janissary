# Document `janus init` under a new "Creating a New Project" user-documentation page

**Complexity: 2/10** — a new markdown page plus one sidebar entry; no source code changes.

## Goal

`janus init` scaffolds the `ai/`/`product/` directory tree (see `product/specs/cli.md`, "Scaffolding a new project") but nothing in `documentation/user-documentation/` walks a user through setting up a new project end to end. Add a page called "Creating a New Project" that covers the steps after install: initializing a git repository, adding a GitHub remote, and running `janus init` to create the scaffolding — with an explanation of what gets scaffolded and pointers to the existing user documentation on `ai/tasks`, `ai/guidelines`, `ai/personas`, and the product workflow.

## Approach

Add `documentation/user-documentation/workflows/creating-a-new-project.md`, alongside the existing `product-development.md` in the "Workflows" sidebar section (same section — this page is the "how do I start one of these projects" companion to that page's "how do I run the workflow once it exists"). Register it in the sidebar in `documentation/.vitepress/config.mts` directly after "Product development workflow".

Content, in order:
1. Prerequisites note — assumes install is already done (link back to `/user-documentation/getting-started/install`).
2. `git init` and adding a GitHub remote (`git remote add origin <url>`) — the two steps needed before `janus init`'s scaffolded `product/plans`/`product/backlog` files can be git-synced.
3. Running `janus init [<project-dir>]` and what it creates, matching `product/specs/cli.md`'s "Scaffolding a new project" section: the `ai/guidelines`, `ai/personas`, `ai/tasks`, `product/backlog`, `product/plans/{draft,ready,complete,deferred}`, `product/specs` directories, and the six seeded backlog files.
4. What each scaffolded area is *for*, with links out: `ai/tasks` → task picker docs (`/user-documentation/command-bar/tasks`), the product workflow (backlog/plans/specs) → `/user-documentation/workflows/product-development`. `ai/guidelines` and `ai/personas` are project-authored (not shipped by `janus init` with content, just empty directories) — describe them as the place to put binding conventions and named collaborator personas respectively, referencing how `CLAUDE.md`-style projects use them, without inventing behavior Janissary itself doesn't ship.

Follow `ai/guidelines/documentation.md` for agent-character placement (3 sprites for a page this length; avoid `hamza`, `mahir`, `orhan` since they're used on the immediately-preceding sidebar page `product-development.md` — use three lightly-used characters instead, e.g. `fariz`, `idris`, `malik`) and `ai/guidelines/human-writing-guidelines.md` for prose style.

## Implementation steps

1. Write `documentation/user-documentation/workflows/creating-a-new-project.md`.
2. Add its sidebar entry to `documentation/.vitepress/config.mts`, in the "Workflows" section, after "Product development workflow".

## Tests

None — this is a documentation-only change with no source code affected. Verify the page builds by running `npm run docs:build` (or `docs:dev` for a manual look) and confirm the new sidebar link resolves.

## Spec updates

None — `product/specs/` describes application behavior, not documentation content. No existing spec covers the shape of the docs site itself.

## Docs

- New page: `documentation/user-documentation/workflows/creating-a-new-project.md`.
- Sidebar: `documentation/.vitepress/config.mts`.
- `help.md` does not mention `init` at all today — nothing to update there.

## Out of scope

- Any change to `janus init`'s actual behavior or to `src/project-init.ts`.
- Adding content to the empty `ai/guidelines`/`ai/personas` directories that `janus init` scaffolds — they ship empty; the new page only explains their purpose.
- Editing `getting-started/install.md`'s "Next steps" pointer — it already correctly points at "Starting the app" for the existing-project flow.
