# Refuse to open a shell tab from a remote agent tab

**Complexity: 3/10** — one additive optional field on an existing capability's answer, one early return in the shell plugin's opener, tests, and doc updates. No new capability, no wire change, and the API integer stays at 1.

## Goal

`product/specs/shell-tab.md` already says a remote agent tab is not a place a shell tab can be opened from: its working directory belongs to the other host, and there is nothing here to start a shell in. The code does not enforce that. `openShellTab` in `src/plugins/shell/open-tab.ts` reads `originTab()`, which never says whether the tab is remote, so `zsh` typed in a remote agent tab opens a local shell at the project root, or at a local directory whose path happens to match the remote one. A user who believes they have a shell on the remote host then runs commands against the local checkout.

The command should instead answer in the remote tab with `A shell tab cannot be opened from a remote tab.` and open nothing.

## Approach

The plugin cannot see the tab record, so the host has to tell it. `originTab()` is the capability that already describes the issuing tab (its label, directory, root and workspace clone), and a remote session is one more fact about where the user was standing. Add an optional `remote: true` to its answer, set only when the tab record has `remote` (the same field `src/tab/view.ts`, `src/connection/catalog.ts` and the schedule manager read). The field is omitted for a local tab, matching how `workspace` is omitted when there is no clone, so every existing answer is unchanged and the addition is v1-compatible.

In `openShellTab`, a remote origin is a request the caller got wrong, not the plugin breaking, so it is answered with `capabilities.rejectRequest(...)`. The host already notes a command's rejection in the originating transcript and leaves the plugin enabled. `rejectRequest` is already in the shell manifest's declared capabilities.

Rejected alternative: exposing the remote address itself. The shell needs only to know the tab is remote, and the address is host state a plugin has no use for; the narrowest answer is a flag.

## Implementation steps

1. `src/plugins/api.ts`: add `remote?: true` to the `originTab()` return type and say what it means in the comment above it.
2. `src/plugins/line-capabilities.ts`: in `originTab`, spread `{ remote: true }` when `tab.remote` is set.
3. `src/plugins/shell/open-tab.ts`: when `origin.remote` is set, call `capabilities.rejectRequest('A shell tab cannot be opened from a remote tab.')` before working out a directory or calling `openOrFocusTab`.
4. Tests (below).
5. Docs: add the exact refusal text to `product/specs/shell-tab.md`; describe the `remote` flag in `originTab`'s entry in `documentation/developer-documentation/tab-plugins.md` and note it in that page's v1 API changelog as additive. `help.md` and `documentation/user-documentation/command-bar/shell.md` both say the shell starts in the issuing tab's working directory, so each gains the remote exception.

## Tests

- `src/plugins/shell-capabilities.test.ts`: `originTab` reports `remote: true` for a tab whose record carries `remote`, and omits `remote` for a local tab.
- `src/plugins/shell/activate.test.ts`: a command from a remote origin throws a `TabPluginRejection` carrying `A shell tab cannot be opened from a remote tab.`, and no tab is opened and no terminal spawned.

## Out of scope

- A remote shell feature (a shell tab running on the remote host). If one is added, this rule is revisited deliberately rather than relaxed.
- Any other plugin's use of the new flag.
- The other entries in the pull request's backlog.
