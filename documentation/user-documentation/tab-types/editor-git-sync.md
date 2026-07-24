# Git-synced files

<img class="agent-float" src="/agents/orhan-south-east.png" alt="" />

Some files can be kept automatically synced with your project's `origin/master` branch: saving one commits and pushes the change for you, with no separate git workflow to run by hand. It's useful for files meant to be hand-edited right inside the app and kept current on GitHub without a manual `add`/`commit`/`push` cycle — the two cases this ships configured for out of the box are product-management files (a backlog, a set of plans) and hand-edited documentation living in the repo.

<img class="agent-float left" src="/agents/selim-south-west.png" alt="" />
## Why sync a file at all

An [editor tab](/user-documentation/tab-types/editor) already lets you open and edit any file in the project. Git-syncing closes the loop for files whose whole point is to be a shared, living record — a backlog, a plan, a doc page — where a stale local edit that never made it to GitHub is worse than useless to anyone else looking at the repo. Rather than remembering to commit and push after every tweak, a synced file's save button does that for you, so the file on GitHub is never more than one save behind what you're looking at.

It's deliberately narrow: only paths you list are synced, nothing else, and there's no per-file toggle in the editor UI. This keeps it predictable — you decide, once, in configuration, which parts of the repo behave this way.

## Configuring which files are synced

Which paths sync is controlled entirely by the `syncPaths` setting in `.janissary/config.json` (see [the app's configuration](/user-documentation/getting-started/startup#configuration)). There's no runtime command for it — edit the file directly:

```json
{
  "syncPaths": ["product/backlog/", "product/plans/", "documentation/"]
}
```

A fresh config already ships with `["product/backlog/", "product/plans/"]`, the two directories most projects want synced by default. Each entry is one of:

- **An exact file path** — syncs that one file only, e.g. `"README.md"`.
- **A directory path ending in `/`** — syncs every file under it, at any depth, e.g. `"product/backlog/"` covers `product/backlog/bugs.md` and anything nested further down.
- **A `*` wildcard standing in for one path segment** — e.g. `"product/backlog/*"` covers files directly inside that directory but not a subdirectory of it, while `"product/plans/*/*"` covers files exactly two directories deep (matching the `draft`/`ready`/`complete`/`deferred` status folders under `product/plans/`).

A file syncs if and only if its project-relative path matches one of these entries; there's no other way to turn syncing on or off for it.

## How the sync happens on save

The first time you open a synced file, its editor tab may briefly show a loading state while a workspace pulls the latest `origin/master`, then shows the file's content. Every config-listed file shares one workspace dedicated to syncing, kept separate from your main project checkout and from any agent's own workspace — it's created the first time any synced file is opened and reused after that for the life of the running app.

Saving a synced file writes and confirms the save exactly like an ordinary save — the "Saved" flash isn't delayed by anything that happens next. After that:

1. The change is committed with the message `sync: <filename>`.
2. The shared workspace pulls the latest `origin/master`.
3. The commit is pushed.

If pulling `origin/master` turns up a conflicting change, the remote version always wins automatically — there's no merge-conflict prompt to resolve, so a sync never blocks you waiting on a decision. Opening a synced file, or another synced file finishing a save, also refreshes the shared workspace from `origin/master`; any other open, unmodified synced tab whose file changed as a result reloads automatically, the same as any external change to a file you have open (see [Editor](/user-documentation/tab-types/editor)). A synced tab with unsaved changes is left alone, same as always.

## Checking sync status

A status icon sits next to the connections button in a synced file's header, showing whether that file's sync is being set up, syncing, synced, or has hit an error. It's read-only — there's no click behavior on it. A sync error (a network problem, an authentication failure, or a project whose default branch isn't literally named `master`) never blocks editing or shows a dialog; it only changes the icon, with details reported through the [notifications](/user-documentation/tab-types/notifications) tab.
