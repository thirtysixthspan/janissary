# Confirm quit and a last-tab close from a plugin tab's command bar

**Complexity: 6/10** — one classification extracted into a shared module, one React context carrying the app's overlay openers and quit dialog to plugin bodies, and one call site on each side of it.

**Goal.** A shell tab's command bar offers every unprefixed line to the server dispatcher, and `quit` on the server is a bare `messageBus.emit('app', { type: 'exit' })` with no confirmation anywhere on the path. One typed word in a shell tab therefore tears down every tab, shell, terminal and browser in the window, discarding the unsaved editor and image buffers [[quit-confirmation]] exists to protect. The interception that catches `quit` lives in the agent tab's own submit chain, and a plugin bar never runs it.

**Approach.** Publish the interception rather than duplicate it. `useCommandBarSubmit` decides what a typed line does in four steps — open a bare-word overlay, open an overlay a plugin claims, confirm a close that would quit, and otherwise send the line to the server — and none of those four steps reaches a plugin. Split the decision out as one pure `classifyCommandBarSubmit(text, tabs, activeTab)` that answers `overlay`, `confirm-quit`, `confirm-close`, `run`, and have both bars call it before anything is sent.

Two things the reviewer's proposal named are not built as written, both verified against the code:

- **`not-a-command` is unreachable and is left out.** A plugin bar routes its own lines before the classifier is consulted — `routeFor` sends `!foo` and `shell foo` straight to zsh and never asks — so every line that does reach the classifier is one the caller is offering onward, and the answer is `run`. A fifth verdict no caller can produce is dead code.
- **`command-interceptions.ts` stays where it is.** `resolveSearchInterception` needs `canSearch` and a transcript `BufferLine[]`, and a plugin tab has neither: `Cmd+F` and `Ctrl+E` do nothing in every plugin tab. Moving it would relocate a module with no second caller, which is the speculative sharing the code guidelines warn against. The search step therefore stays the agent bar's own first check, ahead of the shared classifier.

The bare-opener table does move, and one thing follows from that which the reviewer did not call out: **a bare word in the table now opens its picker from a plugin bar too.** `product/specs/shell-tab.md` already documents that (`ls` runs a shell command and `theme` opens the theme picker), so this aligns the code with a spec that was already written, and it is why the table has to be the shared one rather than a second copy.

## Implementation

1. Add `web/src/shared/command-bar/classify-submit.ts` — `CommandBarVerdict` and `classifyCommandBarSubmit(text, tabs, activeTab)`. It holds the bare-opener table, asks the contributed-overlay seam whether a plugin claims the word (`overlayClaimedByCommand`), and folds `classifyTypedClose`'s logic in from `web/src/agent-tabs/command-input/close-interception.ts`, which is deleted along with its test. Case-insensitive on the command word, exactly as the agent bar's chain is today. A close naming a tab that does not exist is not a close, so it runs rather than being swallowed.
2. Add `web/src/shared/command-bar/bare-openers.ts` — the `BareOpeners` type and `openCommandBarOverlay(command, pickers)`, which tries the table and falls through to `openOverlayForCommand`. One function the caller invokes with the `command` the verdict carries, so the classifier itself never touches a picker.
3. Add `web/src/shared/command-bar/AppCommandBar.tsx` — `AppCommandBarProvider`, `useAppCommandBar()` (throws when absent, as `usePluginChords` does, because a missing provider would silently disable the guard this exists to enforce) and `useAppCommandLine(...)`, which builds the `(line: string) => boolean` callback from the pickers bag, the tabs, the active index, the quit opener and the close guard ref.
4. Rewire `useCommandBarSubmit` onto the classifier and `openCommandBarOverlay`. It keeps the search step, the `nav` branch and `runCommand`; everything between them is the shared classifier. Its whole chain drops well under the cognitive-complexity limit it was written against.
5. Publish `AppCommandBarProvider` and `useAppCommandBar` from `web/src/plugins/api.ts`, beside the `CommandBarShell` already there, and wrap `AppMain` in the provider in `web/src/App.tsx` next to `PluginChordProvider`.
6. In `ShellTab.tsx`, consult `useAppCommandBar()` after the shell route and before the `dispatch` intent: an intercepted line is not offered to the server at all.

The shared classifier's `confirm-close` runs `guardRef.current?.(index)` for a plugin bar too, not only for an agent one. `CloseSaveGuard` is mounted for every tab whatever its view, so the guard is live there and a `close <name>` naming a tab with unsaved work gets the same per-tab save prompt from either bar. With nothing unsaved the guard returns false and the line closes the tab directly.

## Tests

`web/src/shared/command-bar/classify-submit.test.ts`, carrying over every case from the deleted `close-interception.test.ts` against `classifyCommandBarSubmit` and adding the ones the new surface needs: a word in the bare table is an overlay rather than a run, a word a plugin claims through `declareOverlayClaims` is an overlay, an unrelated word is a run, and a close naming no tab is a run rather than a swallowed line.

`web/src/shared/command-bar/AppCommandBar.test.tsx` — the interception the provider hands a plugin body: `quit` opens the quit dialog and nothing is sent, a bare `close` on the last tab does the same, a non-last `close <name>` closes the tab directly when the guard declines, a bare word in the table opens its own picker, and an ordinary word is offered onward.

`web/src/plugins/shell/ShellTab.test.tsx` — the plugin side, rendered under a provider whose interception is the real one: `quit` in a shell tab opens the confirmation and sends no `dispatch` intent, and a non-last `close <name>` still reaches the server. The existing suite gains the provider through its `renderTab` helper and the handful of renders that call `render` directly.

## Out of scope

- A host-side guarantee. The guard stays a client-side interception, so a future destructive command whose name the classifier does not know would still reach the server. One place deciding which words are intercepted is what keeps that list complete, and closing the gap properly is a server-side change to `src/commands/quit.ts` that this pull request does not attempt.
- `nav` and `nav <query>`. It carries an argument and toggles when already open, so it is a branch rather than a table row, and it stays the agent bar's.
- `resolveSearchInterception`, for the reason above.
- The shell tab's `Ctrl+C`/`Ctrl+D`/`Ctrl+Z` handling and its history popup, which are separate findings.