---
name: agent-merge-changes
description: >
  Detect the primary branch (main/master), make changes, create a working branch
  from the modified state, commit, fetch-and-rebase onto origin/<primary>,
  then fast-forward merge to origin/<primary>. If merge is not fast-forward
  (another commit landed on primary), the push is rejected — re-fetch,
  re-rebase, retry. Workspace is disposable so reset/rebase freely.
---

## Setup

These commands assume the agent is inside a workspace tab in Janissary.
Prefix each command with a backtick to run it through the persistent shell.

First, detect the primary branch name:

```text
`git fetch origin
`PRIMARY=$(git remote show origin | grep "HEAD branch" | awk '{print $NF}')
```

This sets `$PRIMARY` to `main` or `master` (or whatever the remote calls its
primary branch). All subsequent steps use `$PRIMARY`.

## Workflow (Janissary commands)

### 1. Make changes

Use file‑editing tools (Read, Edit, Write, Glob, Grep) to implement the
change. The workspace starts on the primary branch (it was cloned from
the root repo), so changes are based on the latest primary.

### 2. Create and switch to a working branch

```text
`BRANCH="$JANUS_AGENT_NAME-$(openssl rand -hex 4)"
`git checkout -b $BRANCH
```

The branch includes the agent name and a unique 8-character hex hash,
e.g. `bilal-a3f8c21b`. Because the working tree already has your
uncommitted changes from step 1, `checkout -b` branches from the current
state — the changes carry over.

### 3. Stage and commit

Stage all changes:

```text
`git add -A
```

Now **examine the staged diff** using your file-reading tools (`git diff --cached` or
read the changed files) and compose a meaningful commit message with:

- A short subject line (conventional commit format: `fix:`, `feat:`, `refactor:`, etc.)
- A blank line
- A paragraph describing what changed and why

Write the message to a file and commit with it:

```text
`git commit -F /tmp/commit-msg
```

This produces commits like:

```
feat: add workspace-backed agent tabs

Clones the root repo's origin remote via git clone into .janissary/workspace/<name>
when agent --workspace is used. The agent shell spawns in the workspace,
and the directory is cleaned up on tab close or app exit. Adds
findRepoRoot, createWorkspace, and removeWorkspace to workspace.ts.
```

### 4. Fetch and rebase onto primary

```text
`git fetch origin $PRIMARY
`git rebase origin/$PRIMARY
```

If there are conflicts, resolve them with your file‑editing tools, then:

```text
`git add -A && git rebase --continue
```

### 5. Fast‑forward merge to origin/<primary>

```text
`git push origin HEAD:$PRIMARY
```

Git **rejects** this push if it is not a fast‑forward merge (e.g. another
committer pushed to `$PRIMARY` while you were working). If rejected:

1. `git fetch origin $PRIMARY`
2. `git rebase origin/$PRIMARY`
3. Retry `git push origin HEAD:$PRIMARY`

## Full script (copy‑paste)

```text
`git fetch origin
`PRIMARY=$(git remote show origin | grep "HEAD branch" | awk '{print $NF}')
`BRANCH="$JANUS_AGENT_NAME-$(openssl rand -hex 4)"
`git checkout -b $BRANCH
`git add -A
`git commit -F /tmp/commit-msg
`git fetch origin $PRIMARY
`git rebase origin/$PRIMARY
`git push origin HEAD:$PRIMARY
```
