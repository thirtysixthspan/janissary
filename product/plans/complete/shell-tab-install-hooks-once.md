# Install the shell tab's startup hooks once per terminal

**Complexity: 5/10** — one new optional payload field and one new intent in the shell plugin's server half, and a reworked attach sequence in `useShellTerminal` with its marker handlers extracted to their own module. No plugin-contract, host, or wire change: the intent travels over the existing `pluginIntent` route and the field rides the existing plugin payload.

## Goal

A shell tab types its hook-setup line into zsh exactly once for the life of its terminal. Docking, undocking, or reloading the browser while `vim`, `python`, `ssh` or a `sudo` prompt holds the foreground no longer types the setup line into that program, no longer hides the terminal until the program exits, and no longer clears the screen or raises a spurious unread badge when the stray setup line finally runs.

## Approach

Today `useShellTerminal` runs on every mount: it hides the terminal, writes the setup line through the attachment, and reveals and clears the terminal when the line's `133;E` marker arrives. Commit 9fc019eb made every marker carry a nonce minted per attach, so a remount also has to retype the line for zsh to switch to the new nonce.

The fix makes the server the record of whether the hooks are installed, and with which nonce. The shell payload gains an optional `hookNonce`: absent until the hooks are installed, and then the nonce they were installed with for the rest of the PTY's life. Its presence is the "initialized" flag the review proposed, so one field carries both facts and they cannot disagree.

A new `install-hooks` intent is a compare-and-set. The client sends the nonce it minted; when the payload has no `hookNonce` yet, the server stores that nonce with `updateTab` and answers `{ install: true, nonce }`, and otherwise it stores nothing and answers `{ install: false, nonce: <stored> }`. The intent runs synchronously on the server, so of two clients that attach before either has installed (two windows open on a new shell, or a remount inside the first round trip) exactly one is told to install, and both learn the same nonce. This closes the race the review left as residual risk.

On the client, `useShellTerminal` takes the payload's `hookNonce` (read once, at mount) and a `claimHooks(nonce)` function:

- With a `hookNonce`, the mount only re-attaches. It registers the marker handlers with that nonce, writes nothing into the PTY, does not hide the terminal, and does not clear it.
- Without one, it hides the terminal as today, mints a nonce, attaches, and then claims. Told to install, it writes the setup line built from the returned nonce. Told not to, it switches its handlers to the returned nonce and reveals the terminal, because someone else's setup line is already on its way.

A claimed install is written even if the component unmounted while the claim was in flight. The server already recorded the hooks as installed, so dropping the write would leave a shell whose markers nobody can ever see. The attachment's `write` only sends a `ptyInput` message, which still works after `detach`.

The `E` marker keeps revealing and clearing the terminal. Because the setup line now runs once per PTY, `E` arrives once per PTY, and clearing at that point only removes the echoed setup line, whichever mount happens to be attached.

`useShellTerminal` is already 190 lines, so the two OSC handlers and the claim step move into a new `web/src/plugins/shell/shell-marker-handlers.ts`. The handlers read the nonce from a small mutable holder rather than a closed-over constant, so the claim answer can switch it. The setup-line history exclusion compares against the hook text built from the holder's current nonce.

`ShellTab` passes `payload.hookNonce` and a `claimHooks` built by a new `web/src/plugins/shell/claim-shell-hooks.ts`, which sends the intent and reports a refused one through `reportFailure`, the way `report-shell-cwd.ts` does for the cwd intent.

The payload schema version stays at 2. The field is optional and additive, a payload without it is still valid and means what it always meant (no hooks installed yet), and the plugin's payloads are in-memory only.

### Rejected alternatives

- A boolean `initialized` set when the client sees `E`, as the review proposed. It leaves the nonce question open (a remount needs the nonce the first attach chose, which only that attach knew), and setting it at `E` widens the double-install window to the whole time zsh takes to run its startup files.
- A nonce minted by the server at spawn. That makes the field required, which churns every shell payload fixture in the suite, and it still needs a separate flag for whether the hooks were written.

## Implementation steps

1. `src/plugins/shell/shared.ts`: add `hookNonce?: string` to `ShellPayload`, an exported `ShellHookClaim = { install: boolean; nonce: string }`, and an import-free `isShellMarkerNonce` guard (32 lowercase hex characters, the shape `createShellMarkerNonce` produces). `isShellPayload` accepts an absent `hookNonce` or one passing that guard.
2. `src/plugins/shell/activate.ts`: add the `install-hooks` intent with `isShellMarkerNonce` as its payload guard and the compare-and-set described above.
3. `web/src/plugins/shell/shell-marker-handlers.ts`: move the OSC 133 and OSC 7 handlers out of `useShellTerminal`, reading the nonce from a holder, and add the claim-and-install step.
4. `web/src/plugins/shell/useShellTerminal.ts`: take `hookNonce` and `claimHooks`, re-attach without hiding or writing when a nonce is installed, and claim before writing the setup line otherwise.
5. `web/src/plugins/shell/claim-shell-hooks.ts` and `web/src/plugins/shell/ShellTab.tsx`: send the intent, report a refusal, and pass the payload's nonce through. `ShellTab.tsx` sat at the 200-line limit, so its `useShellTerminal` call and the intent wiring around it (command state, cwd, exit, and now the claim) move into a new `web/src/plugins/shell/useShellTabTerminal.ts` hook.
6. Update `product/specs/shell-tab.md`.

## Tests

- `src/plugins/shell/activate.test.ts`: the first `install-hooks` claim stores the nonce in the payload and answers `install: true`; a claim on a payload that already carries a nonce stores nothing and answers `install: false` with the stored nonce; a claim whose nonce is not 32 hex characters is rejected without disabling.
- `src/plugins/shell/shared.test.ts`: the payload guard accepts an absent or well-formed `hookNonce` and rejects a malformed one; `isShellMarkerNonce` accepts a minted nonce and rejects other strings.
- `web/src/plugins/shell/useShellTerminal.test.ts`: the existing marker cases wait for the claim before reading the nonce from the setup line. New cases: mounting with a `hookNonce` writes no setup line, claims nothing, leaves the terminal visible, and acts on markers signed with that nonce; mounting twice for the same pty with the installed nonce writes nothing either time; a claim answered `install: false` writes nothing, reveals the terminal, and switches to the returned nonce; a claim answered `install: true` after the hook unmounted still writes the setup line.
- `web/src/plugins/shell/ShellTab.test.tsx`: the intent mock answers `install-hooks`; a tab whose payload carries a `hookNonce` writes no setup line and sends no `install-hooks` intent.

## Out of scope

- A remounted terminal starts with an empty screen, since nothing replays what the shell printed before it attached. zsh redraws its prompt only if the reattach changes the terminal's size or the user presses a key. Replaying scrollback is a separate feature.
- If the page that won the claim dies before its setup line reaches the server, the shell keeps working but reports no markers for its lifetime. The window is one intent round trip.
- Decoding OSC 7 reports exactly (a separate backlog entry).
- User documentation: it says the terminal appears after startup with a plain prompt, which still holds; it never described remounts.
