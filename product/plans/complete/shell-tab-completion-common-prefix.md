# Fill in the longest common prefix when shell-tab completion has several matches

**Complexity: 2/10** — a one-condition change in the shell tab's `Tab` handler plus test and spec updates. The server already computes the longest common prefix; the client just throws it away.

The application's completion (`completeCommandLine` in `src/completion/index.ts`, through `completeWord` in `src/completion/helpers.ts` and `completeFilePath` in `src/completion/fs.ts`) already returns `newInput` with the token replaced by the longest common prefix of every match when there are several. The shell tab's command bar (`web/src/plugins/shell/ShellTab.tsx`) only applies `newInput` when there is exactly one match, so with several matches the line never advances past what was typed, even when every candidate shares more characters. The tab-completion spec and the user documentation already describe the prefix behavior; the shell tab spec describes the narrower behavior the code has today.

## Goal

When `Tab` produces several matches, the shell tab's command line is filled in with the matches' longest common prefix, up to the point where they diverge, and the candidate strip still shows. One match keeps completing in full. No matches keep leaving the line unchanged. `Escape` with the strip visible still closes the strip and leaves the line as it is (now the extended line).

## Approach

In `ShellTab.tsx`'s `Tab` branch, apply `result.newInput` whenever `result.matches` is non-empty instead of only when it has exactly one entry. The server guarantees `newInput` equals the current line when nothing matched, and holds the common prefix when several did, so no client-side prefix logic is needed (principle 1: the server owns what is shown).

## Implementation steps

1. `web/src/plugins/shell/ShellTab.tsx`: change `if (result.matches.length === 1) setDraft(result.newInput);` to apply `newInput` when `result.matches.length > 0`.

## Tests

In `web/src/plugins/shell/ShellTab.test.tsx`:

- New: with matches `['docs/', 'dotfiles/']` and `newInput` `'ls do'`, typing `ls d` and pressing `Tab` fills the bar with `ls do` and shows the strip.
- New: with matches but a `newInput` equal to the typed line (candidates diverge right away), the bar keeps the typed text and shows the strip.
- Update `dismisses completion choices on Escape without changing the command line`: the bar now holds the common prefix after `Tab`; assert `Escape` closes the strip and keeps that extended line.

## Spec and docs

- `product/specs/shell-tab.md`: the "Tab completion is the application's" paragraph says several matches show the strip; add that they first fill in their longest common prefix.
- `product/specs/tab-completion.md` and `documentation/user-documentation/command-bar/tab-completion.md` already describe the prefix behavior; no change.

## Out of scope

- A keyboard- and mouse-navigable picker for the candidates (a separate backlog issue).
- Placing the caret at the server's `newCursor` for a completion in the middle of the line; the single-match path ignores it today too.
- A completion reply that arrives after the user has kept typing overwriting the newer text; the single-match path has the same race today.
