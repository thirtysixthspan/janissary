# Creating a new project

<img class="agent-float" src="/agents/fariz-south.png" alt="" />

Once Janissary itself is [installed](/user-documentation/getting-started/install), the next question is how to point it at an actual project. This page walks through that setup once, from an empty directory to a repo that's ready for agents to work in.

## Start with a git repository

`janus` doesn't require git, but the workflow described below leans on it heavily — plans and specs are meant to be committed and pushed as they change, and [git-synced files](/user-documentation/tab-types/editor-git-sync) push straight from an editor tab. So the first step, in your project's directory, is the usual pair:

```
git init
git remote add origin <your-repo-url>
```

Create the remote on GitHub first — either from [github.com/new](https://github.com/new) or with `gh repo create` — and use the URL it gives you for `origin`. If you already have a repository cloned locally, you can skip straight to the next step.

## Add a GitHub token for workspaced pushes

<img class="agent-float left" src="/agents/idris-south-east.png" alt="" />

This step is optional. [Workspaced agents](/user-documentation/advanced-agents/workspaced-agent) run inside a sandbox that can't authenticate git over SSH, so pushing or using `gh` from inside a workspace needs an HTTPS-compatible token. Without one, workspaces still work fine for local development — commit, fetch, pull all just work — only `git push` and `gh` (PR creation, merging) from inside a workspace will fail.

To set one up: create a fine-grained personal access token at [github.com/settings/tokens](https://github.com/settings/tokens), scoped to this repository, with **Contents** (write), **Pull requests** (write), and **Metadata** (read) permissions. Save it to `.janissary/github-token` in the project's root directory — a plain text file containing just the token. `.janissary/` is gitignored by default, so the token is never committed.

## Scaffold the project

<img class="agent-float left" src="/agents/idris-south-east.png" alt="" />

With a repository in place, run:

```
janus init
```

This creates the `ai/` and `product/` directory tree that the rest of Janissary's task workflow expects: `ai/guidelines`, `ai/personas`, and `ai/tasks` under `ai/`, and `product/backlog`, `product/plans/draft`, `product/plans/ready`, `product/plans/complete`, `product/plans/deferred`, and `product/specs` under `product/`. It also seeds `product/backlog/` with six starter files — `bugs.md`, `chores.md`, `documentation.md`, `features.md`, `issues.md`, and `technical-debt.md` — each with the same empty `ready`/`development`/`deferred` structure. Finally, it installs the standard `.codex/config.toml`, `.codex/rules/default.rules`, and `.claude/settings.json` files for the project's coding-agent workflow.

Running `janus init` again refreshes those standard configuration files, so updates to Janissary's defaults reach an existing project. It preserves any other files you add under `.codex/` or `.claude/`, as well as the contents of existing backlog files.

Commit what it creates and push. That's the project scaffolded.

## What the scaffolded files are for

<img class="agent-float" src="/agents/malik-south-west.png" alt="" />

Each directory `janus init` creates has a specific job, and none of them do anything on their own — they're just the plain files and folders that the rest of Janissary's conventions are built around.

**`product/backlog/`, `product/plans/`, and `product/specs/`** are the three pieces of the [product development workflow](/user-documentation/workflows/product-development): short lists of what's worth doing next, one file per unit of work thought through before it's built, and one file per part of the finished product describing what it actually does right now. That page covers the full loop — read it before writing your first backlog entry.

**`ai/tasks/`** holds the self-contained instruction files that drive that loop — one file per stage, like "plan the next item" or "build it" — opened without typing a path by hand through the [task picker](/user-documentation/command-bar/tasks) (`Ctrl+A`). `janus init` creates the empty directory; the task files themselves are something you write for your own project, describing the stages that make sense for it.

**`ai/guidelines/`** is where binding project conventions live — coding standards, writing style, anything you want every agent working in the project to follow without being told each time. It starts empty; what goes in it is up to you.

**`ai/personas/`** holds named collaborator personas — a way to give an agent a consistent role and voice across sessions rather than re-explaining it every time. Like guidelines, it starts empty and is populated as the project grows.

None of these directories need content to be useful right away. A project can run for a while with just the backlog and a couple of plans before guidelines or personas become worth writing down — add them when the project is big enough that repeating yourself starts to hurt.
