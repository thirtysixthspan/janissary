# Contain a refused shell terminal spawn as a rejection

**Complexity: 4/10** — three small server changes on an existing seam (the shell's cwd guard, the shell's starting-directory check, and the host's terminal bound), plus tests. No contract shape changes: `TabPluginRejection` is already the published way to answer one bad request.

## Goal

One bad directory must not disable the shell plugin and close every shell. Today the shell plugin decides where a new shell starts with a plain string-prefix check, while the host's spawn bound resolves the path first, so a recorded cwd such as `/repo/a/../../etc` passes the plugin's check and is refused by the host. That refusal is a plain `Error`, which the plugin failure boundary treats as the plugin breaking: the shell plugin is disabled and every open shell tab and zsh process closes. A spawn that fails for any other reason (node-pty refusing a directory, for one) does the same.

## Approach

Close the gap from both ends:

- Stop the bad directory getting in. The `cwd` intent accepts any string starting with `/`. Tighten the guard to accept only an absolute path already in normal form: no empty, `.` or `..` segments and no trailing slash except the root itself. zsh's `$PWD` is always in that form, so a real report never trips it, and a crafted OSC 7 report is a rejected intent rather than a recorded cwd. The guard stays hand-written and import-free, as the shared-module rule requires.
- Make the plugin and the host agree. Replace the shell's string-prefix `isInside` with `isInsideRoot` from `src/plugins/files.ts`, the same resolved, separator-bounded check the host's spawn bound uses. A directory the host would refuse now falls back to the workspace clone or project root inside the plugin instead of reaching the host at all.
- Contain whatever still gets through. In `spawnPluginTerminal`, throw a `TabPluginRejection` for the out-of-root refusal, and convert a `pty.spawn` failure into one too. `withResources` already kills any terminal started before a factory throws and rethrows the original error, and `invokePlugin` already maps a `TabPluginRejection` to `status: 'rejected'`, which `runGuarded` notes in the originating transcript while leaving the plugin enabled. A spawn failure is an environmental outcome, like an undecodable video, not the plugin being broken.

Rejected alternative: catching the error in the shell plugin's factory and calling `rejectRequest`. That would contain the shell but leave every future terminal-owning plugin one refused directory away from being disabled; the host owns the bound, so the host owns how a refusal is classified.

## Implementation steps

1. `src/plugins/shell/shared.ts`: tighten `isShellCwd` to normal-form absolute paths.
2. `src/plugins/shell/open-tab.ts`: delete `isInside` and use `isInsideRoot` from `../files.js` for both the project-root and workspace checks.
3. `src/tab/plugin-terminals.ts`: throw `TabPluginRejection` for the out-of-root refusal with the message `Cannot start a terminal in <cwd>: it is outside the project root <root>.`, and wrap `pty.spawn` so a throw becomes `TabPluginRejection` with `Cannot start a terminal in <cwd>: <first line of the error>.`
4. Tests (below).
5. Update `product/specs/shell-tab.md` and `product/specs/tab-plugins.md`.

## Tests

- `src/plugins/shell/shared.test.ts`: `isShellCwd` accepts `/` and `/repo/sub`, and refuses `relative`, `/repo/a/../../etc`, `/repo/./sub`, `/repo//sub`, `/repo/` and `/repo/..`.
- `src/plugins/shell/activate.test.ts`: a `cwd` intent carrying `..` segments is refused by the payload guard and records nothing; a shell whose origin cwd is `/repo/a/../../etc` starts in the project root; a sibling directory whose name starts with the root's (`/repo-evil`) is not treated as inside it.
- `src/tab/manager.test.ts`: the existing out-of-root cases now expect a `TabPluginRejection`, and a `pty.spawn` throw surfaces as a `TabPluginRejection` naming the directory.
- New `src/plugins/terminal-refusal.test.ts`, against a real `TabManager` and `TabPluginHost` with a terminal-owning fixture plugin: an out-of-root spawn from a factory produces a rejection noted in the issuing tab, no new tab and no running terminal, and the plugin stays `active` with its earlier tab and terminal still open; a spawn that throws behaves the same way.

## Out of scope

- Classifying every other factory error (an invalid payload, an empty title) as a rejection. Those are the plugin producing something wrong and still cross the failure boundary.
- Refusing a shell from a remote origin tab, and recording the spawned directory as the new tab's cwd. Both are separate backlog entries.
