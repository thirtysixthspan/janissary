# Shell tab Cmd+T from the focused terminal

**Complexity: 3/10** — the plugin chord-claim path already exists and the window key handler already consults it before the application's own `Cmd+T`; the shell only claims `Ctrl+R` today, and its claim hook hands every chord to one handler.

## Goal

`Cmd+T` opens another zsh tab from a shell tab wherever the keyboard is inside that tab, as `product/specs/shell-tab.md` already says. Today the chord is handled only by the command bar's own key handler, so with the terminal focused the keydown reaches the window handler unclaimed and opens a new agent tab instead.

## Approach

Claim `meta+t` in the shell manifest's `chords` list beside `ctrl+r`, and answer it from the mounted body through `usePluginChordClaims`, which is how `Ctrl+R` already reaches the shell. The window key handler (`handleChordKeys` in `web/src/useWindowKeys.ts`) runs `chords.run` before `metaChordOpener`, so a claim held by the shell tab around the focused element beats `newAgentTab`. The claim is registered only while the tab is the visible one, and keyed by the tab label around the focused element, so `Cmd+T` typed into an agent tab's bar beside a docked shell still opens an agent tab.

xterm does not cancel a `Cmd`+letter keydown (it produces no terminal data), so the event bubbles from the terminal's helper textarea to the window listener. The command bar's baseline key handler returns early on any modifier, so the same is true from the bar once the bar-only branch is removed. One path, not two.

`usePluginChordClaims` registers one handler for every claimed chord. With two chords the body has to know which one fired, so the hook passes the chord id to the handler. That is an additive change to the published client hook: an existing handler that takes no argument still type-checks and behaves the same.

Rejected: a second `usePluginChordClaims` call per chord. The hook reads the claim list from the host-sent `claimedChords`, and splitting it would mean the body filtering that list by id in two places, which is the same knowledge with more moving parts.

## Implementation steps

1. Add `'meta+t'` to `chords` in `src/plugins/shell/manifest.ts` and update its comment.
2. In `web/src/plugins/PluginChords.tsx`, change `PluginChordHandler` to receive the chord id, and have `usePluginChordClaims` pass the id it registered.
3. In `web/src/plugins/shell/ShellTab.tsx`, route the claim handler on the chord id: the new-shell chord dispatches `zsh` through the `dispatch` intent, anything else toggles the history popup. Delete the `Cmd+T` branch in the bar's key handler. Keep the new-shell chord id beside the other shell constants.
4. Update the API changelog line for `chords` in `documentation/developer-documentation/tab-plugins.md` to note that the claim handler receives the chord id.

## Tests

- `web/src/plugins/shell/ShellTab.test.tsx`: the claimed `meta+t` dispatches `zsh` and opens no history popup; a `Cmd+T` keydown in the bar is left unhandled by the bar (not default-prevented), so it reaches the window handler and its claim; the default `claimedChords` mirrors the manifest.
- `web/src/useWindowKeys.test.ts`: a `Cmd+T` keydown from an element inside the shell tab's labelled container runs the shell's claim and not `runCommand('agent')`; with no claim the same keydown opens an agent tab; the handler receives the chord id.
- `src/plugins/declaration-validation.test.ts`: the bundled shell manifest's chord list passes the chord-id check.

## Spec and docs

`product/specs/shell-tab.md` gains a sentence that `Cmd+T` works with the terminal focused as well as the command bar. `help.md` and `documentation/user-documentation/command-bar/shell.md` already describe `Cmd+T` without naming a focus, so they need no change.

## Out of scope

- Any other chord, or changing what the new shell inherits.
- Changing xterm's own key handling.
