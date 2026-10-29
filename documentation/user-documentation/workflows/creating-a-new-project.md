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

To set one up: create a fine-grained personal access token at [github.com/settings/tokens](https://github.com/settings/tokens), scoped to this repository, with **Contents** (write), **Pull requests** (write), and **Metadata** (read) permissions. Save it to `.janissary/github-token` in the project's root directory — a plain text file containing just the token. Janissary doesn't add anything to your `.gitignore`, so add `.janissary/github-token` there yourself before you commit. A token in `~/.janissary/github-token` works for every project on the machine instead, and a project's own file wins where both exist.

[Tokens for agents](/user-documentation/advanced-agents/tokens) covers this token in more detail, along with the separate one that keeps a `claude` harness signed in inside a workspace.

## Scaffold the project

With a repository in place, run:

```
janus init
```

`janus init` runs in the foreground and prints what it did. To scaffold another directory, pass it as `janus init <project-dir>`. The directory has to exist already.

```
Scaffolded ai/ and product/ in /home/you/my-project:
  ai/guidelines
  ai/personas
  ai/tasks
  product/backlog
  product/plans/draft
  product/plans/ready
  product/plans/complete
  product/plans/deferred
  product/specs
Installed .codex/ and .claude/ configurations (standard files overwritten).
```

That is the `ai/` and `product/` directory tree that the rest of Janissary's task workflow expects. The command lists the same nine directories on every run, whether it just created them or they were already there. It doesn't run `git init` for you.

It also does four other things:

- Seeds `product/backlog/` with six starter files, `bugs.md`, `chores.md`, `documentation.md`, `features.md`, `issues.md`, and `technical-debt.md`. Each has the same empty `ready`/`development`/`deferred`/`declined` structure.
- Puts an empty `.gitkeep` file in every one of the nine directories that is still empty, so git tracks it. The backlog directory doesn't need one.
- Writes `.janissary/launcher.json` with the default command rail for the [launcher](/user-documentation/tab-types/launcher): Shell, Harness, File navigator, SQL, Notifications, Schedules, Sessions, Conversations, Roles, and Search.
- Installs `.codex/config.toml`, `.codex/rules/default.rules`, and `.claude/settings.json` for the project's coding-agent workflow.

The Codex file asks for approval on request and runs with full access. It keeps `GH_TOKEN`, `GITHUB_TOKEN`, and your shell setup visible to the commands Codex runs, so `git push` and `gh` can authenticate. The Claude file turns off the commit attribution text, so commits Claude makes carry no `Co-Authored-By` line. It also pre-approves a list of common commands such as `git`, `gh`, and `npm`.

Running `janus init` again is safe. It refreshes those standard Codex and Claude files, so updates to Janissary's defaults reach an existing project, and it preserves any other files you add under `.codex/` or `.claude/`. It never overwrites an existing backlog file or `launcher.json`, so your edits to either survive. Edit `launcher.json` to change the rail, or delete it to fall back to the built-in list.

Commit what it creates and push. `.janissary/` also holds logs, tokens, and per-run state, so from that folder commit only `launcher.json`, and only if you want the whole team to share the rail. That's the project scaffolded.

## What the scaffolded files are for

<img class="agent-float" src="/agents/malik-south-west.png" alt="" />

Each directory `janus init` creates has a specific job, and none of them do anything on their own — they're just the plain files and folders that the rest of Janissary's conventions are built around.

**`product/backlog/`, `product/plans/`, and `product/specs/`** are the three pieces of the [product development workflow](/user-documentation/workflows/product-development): short lists of what's worth doing next, one file per unit of work thought through before it's built, and one file per part of the finished product describing what it actually does right now. That page covers the full loop — read it before writing your first backlog entry.

**`ai/tasks/`** holds the self-contained instruction files that drive that loop — one file per stage, like "plan the next item" or "build it" — opened without typing a path by hand through the [task picker](/user-documentation/command-bar/tasks) (`Ctrl+A`). `janus init` creates the empty directory; the task files themselves are something you write for your own project, describing the stages that make sense for it.

**`ai/guidelines/`** is where binding project conventions live — coding standards, writing style, anything you want every agent working in the project to follow without being told each time. It starts empty; what goes in it is up to you.

**`ai/personas/`** holds named collaborator personas — a way to give an agent a consistent role and voice across sessions rather than re-explaining it every time. Like guidelines, it starts empty and is populated as the project grows.

None of these directories need content to be useful right away. A project can run for a while with just the backlog and a couple of plans before guidelines or personas become worth writing down — add them when the project is big enough that repeating yourself starts to hurt.
