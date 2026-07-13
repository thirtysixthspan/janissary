# `files in <label> on <side>` command syntax

**Complexity: 3/10** — the dock mechanism (`setDock`) and cwd/root resolution already exist and are
well-factored; this only adds two new optional clauses to the existing `files` command parser,
reusing the tab-lookup helper already shared by `queue`/`send`.

## Goal

Extend the `files` command so a file tree can be opened rooted at **another tab's cwd** and docked
in one shot: `files in <tab label> on <dock side>`, e.g. `files in claude on left` opens (or
refocuses/redocks) a file tree rooted at the `claude` tab's working directory, docked into the left
sidebar. Both clauses are optional and independent of each other:

- `files in claude` — root at `claude`'s cwd, no docking (same placement rules as bare `files`).
- `files on left` — dock left, rooted at the issuing tab's cwd (today this requires the bare
  `files left` keyword form; `on left` is a second, more explicit spelling).
- `files in claude on left` — both together.

If `<tab label>` does not resolve to an existing tab, the command fails the same way `queue`/`send`
already do for an unknown target: an error is appended to the issuing tab's transcript
(`No tab named "<label>".`) and no file tree tab is created or moved.

## Existing behavior to preserve

- Bare `files [path]` and `files left|right [path]` (the keyword recognized only as the first word)
  keep working exactly as today — this is additive, not a replacement.
- A directory literally named `in`, `on`, `left`, or `right` stays reachable through an explicit path
  form (`files ./in`), since these words are only treated as clause keywords when they appear as the
  next token(s) in the argument list, never scanned for mid-path.

## Files involved

- `src/file-tree-manager.ts` — `FileTreeManager.open()` (~line 32): parser and root/dock resolution.
- `src/commands/resolve-target.ts` — existing `resolveTarget(label, managers, append)` helper (used
  by `queue`/`send`); reuse it verbatim for the `in <label>` lookup and its "not found" message.
- `src/commands/files.ts` — top-of-file comment describing the command's forms; update to mention
  the new syntax. No logic change — `files.ts` just forwards the whole command string to
  `FileTreeManager.open()`.
- `src/file-tree-manager.test.ts` — extend with the new parsing cases.
- `specs/file-tree-tab.md` — add a subsection documenting the new syntax.

## Implementation steps

1. **`src/file-tree-manager.ts`**: import `resolveTarget` from `./commands/resolve-target.js`.

2. Rewrite the top of `open()`'s parsing to consume `in <label>` and `on <left|right>` clauses, in
   either order, before falling back to the existing bare `left`/`right` keyword:

   ```ts
   open(command: string, label: string): void {
     const rest = command.replace(/^files\b\s*/i, '');
     let cursor = rest;
     let inLabel: string | undefined;
     let dock: 'left' | 'right' | null = null;

     for (;;) {
       const inMatch = !inLabel ? /^in\s+(\S+)\b\s*/i.exec(cursor) : null;
       if (inMatch) { inLabel = inMatch[1]; cursor = cursor.slice(inMatch[0].length); continue; }
       const onMatch = !dock ? /^on\s+(left|right)\b\s*/i.exec(cursor) : null;
       if (onMatch) { dock = onMatch[1].toLowerCase() as 'left' | 'right'; cursor = cursor.slice(onMatch[0].length); continue; }
       break;
     }
     if (!inLabel && !dock) {
       const keyword = /^(left|right)\b\s*/i.exec(cursor);
       if (keyword) { dock = keyword[1].toLowerCase() as 'left' | 'right'; cursor = cursor.slice(keyword[0].length); }
     }

     const target = cursor.trim();
     const out = (text: string) => this.managers.tab.append(label, { input: command, output: text });

     let cwd: string;
     if (inLabel) {
       const sourceTab = resolveTarget(inLabel, this.managers, out);
       if (!sourceTab) return;
       cwd = this.managers.tab.cwdOf(sourceTab.label) ?? process.cwd();
     } else {
       cwd = this.managers.tab.cwdOf(label) ?? process.cwd();
     }

     const expandedPath = target ? expandUserPath(target, { root: this.managers.tab.launchDir }) : '';
     const root = target ? (path.isAbsolute(expandedPath) ? expandedPath : path.resolve(cwd, expandedPath)) : cwd;
     // ...rest of the method (stat check, existing-tab focus/redock, new-tab creation) is unchanged.
   ```

   Note `out` moves earlier (it no longer depends only on `command`/`label`, which were already
   available) so the `in <label>` lookup can use it before the not-a-directory check further down.

3. Update the doc comment above `open()` to describe the two new clauses alongside the existing
   `left`/`right` keyword and path-literal escape hatch.

4. **`src/commands/files.ts`**: update the top comment to mention `files in <label> on <side>` as a
   supported form.

## Tests

Add to `src/file-tree-manager.test.ts` (mirroring the existing `files left`/`files right sub`
tests). The current mock's `cwdOf` returns a fixed `root` regardless of label — extend it to be
label-aware so an `in <label>` test can assert a *different* cwd was used:

- Add a second tab (`other`) to the mock `tabs` array and an `otherRoot` temp dir (via
  `mkdtempSync`), and change the mock's `cwdOf` to `(l: string) => (l === 'other' ? otherRoot : root)`.
- `'files in other' roots the tree at the referenced tab's cwd'` — `manager.open('files in other', 'janus')`, assert the new tab's `files.root` is `otherRoot`.
- `'files in other on left' roots at the referenced tab's cwd and docks left'` — assert both `files.root === otherRoot` and `tab.dock === 'left'`.
- `'files on left docks without changing the root'` — `manager.open('files on left', 'janus')`, assert `tab.dock === 'left'` and `files.root === root`.
- `'files in <unknown label> errors into the creator transcript and creates no tab'` — `manager.open('files in ghost', 'janus')`, assert `outputs.at(-1)` contains `No tab named "ghost".` and no navigator tab was created.
- `'a directory literally named in/on is reachable via a path form'` — mirror the existing
  `left`/`right` literal-directory test: `mkdirSync(path.join(root, 'in'))`, then
  `manager.open('files ./in', 'janus')`, assert `files.root === path.join(root, 'in')`.

Run `./scripts/run.mjs check-diff` after implementing and again after adding tests.

## Spec update

`specs/file-tree-tab.md` — add a subsection after `### files left`/`files right [path]` (around line
47) documenting:

- `files in <label>` roots the tree at the cwd of the tab named `<label>` instead of the issuing
  tab's cwd; if no tab has that label, an error is appended to the issuing tab's transcript and no
  tree is opened or moved.
- `files on <left|right>` is an explicit spelling of the same docking `files left`/`files right`
  already provides.
- The two clauses combine and may appear in either order: `files in <label> on <side>`.

## Out of scope

- Changing the existing bare `left`/`right` keyword form — it stays exactly as documented today.
- Any new tab-lookup mechanism — this reuses `resolveTarget` as-is, no changes to that file.
- Docking/undocking semantics themselves (existing-tab redock/displace rules) — unchanged, only the
  syntax for reaching them is extended.
