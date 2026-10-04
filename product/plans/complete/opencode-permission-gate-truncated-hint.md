# Keep opencode auto-approve working beside opencode's own sidebar

**Complexity: 2/10** — two screen-text predicates in one pure detector, plus tests. No wire, protocol, component, or state change; the detection, the approval keystroke, and the approver loop all already exist and stay as they are.

## Goal

opencode paints its permission prompt into a panel on the left of the screen. When opencode also shows its own sidebar, the sidebar takes the right of the screen and changes the panel two ways, both of which stop `detectOpencodePermissionGate` from matching:

1. **The panel's rows stop being the whole row.** opencode paints panel and sidebar into the *same* screen rows, so a captured line is the panel's text, padding, then the sidebar's text. The title anchor compares a row for equality against `△ Permission required`, so the sidebar's text appended to the title's row breaks it. This alone defeats every prompt beside a sidebar, at any width.
2. **The confirm hint gets clipped.** The hint trails the option row, right-aligned to the panel, and opencode clips it rather than wrapping it, so a narrower panel delivers `ctrl+f fullscreen  ⇆ select  enter confirm` as `… ⇆ select  enter conf` — and `isConfirmFooter` requires the literal `enter confirm`.

Auto-approve then never injects its Enter, the tab sits on the prompt forever, and nothing says so: `HarnessAutoApprover` only reports "could not clear the permission prompt" for a gate it *did* match and could not clear, so a gate it never matched is silent. Recognize the panel beside a sidebar and opencode keeps working with one on screen.

The two screens in `product/backlog/issues.md` are the evidence: both show the live external-directory prompt beside opencode's todo sidebar, and neither is detected. The wider one (141 columns) has the whole hint and fails only on the title row; the narrower one (120 columns) fails on the title row *and* reads `enter conf`.

## Design decisions

- The **title anchor becomes a prefix match**. The title's row is the panel's own text at a fixed column followed by, to its right, whatever the sidebar painted on that same row, so the row must be read by its leading text rather than for equality. This is the same anchoring the codex detector already uses for its titles (`startsWith` plus `endsWith` around variable middle text). It costs nothing in discrimination: prose that merely mentions a required permission still fails, because the mention is mid-line rather than leading, and opencode's `Always allow` stage carries a different title that no prefix of `△ Permission required` accepts.
- The **footer check becomes an either/or over two anchors**, because truncation removes the hint's tail and so the token that survives longest is the leftmost one:
  - the confirm hint itself, `enter conf`, accepted whether opencode finished it (`enter confirm`) or clipped it there;
  - the select hint, `⇆ select`, which outlives the confirm hint and so still answers for a panel narrow enough to have clipped the tail.
- Anchoring on both, rather than on `⇆` alone, is deliberate. `⇆ select` is the leftmost durable token and would cover the widest range of truncations, but replacing the existing `enter confirm` anchor with it would regress any rendering that carries the confirm hint without the select hint. Requiring either keeps every currently-matched screen matched.
- `enter conf` is matched as a bounded prefix: the text after it must be end-of-line or the `irm` that completes `confirm`. A longer word that merely begins the same way (`enter config`) is not the hint.
- **Neither fix needs the panel's width.** Janissary cannot know how wide opencode's panel is, only where its own border ends, so clipping each row at a computed column is not available. Reading the panel's leading text is what the row-level anchors can do without it, and it is what `isOptionRow` has always done.
- The option-row anchor is untouched, because neither effect reaches it: `panelText` already strips opencode's leading `┃` from every row including the sidebar's, the options lead their row at a fixed column, and clipping cuts the hint's right so `Allow once`/`Allow always`/`Reject` survive it. The screens in the issue confirm all three.
- Clipping is opencode's own layout decision, not a janissary misreport: the hint ends where the panel ends, in both screens, and the column budget accounts for it (at 120 columns the panel ends at column 76 and the clipped hint ends at column 76). Nothing in this repository reports a wrong `cols` to the harness — `web/src/shared/terminal/useXterm.ts` fits and resizes the PTY per terminal, and `HarnessScreenReader` mirrors every `ptyResize`, so the mirror the detector reads has the width opencode rendered at.
- Detection stays pure, deterministic, and width-agnostic. It recognizes the prompt's *structure* — title, then a later option row, then the hint on that row or below it — exactly as `auto-approve.ts`'s claude and codex detectors do.

## What already exists (reuse, don't rebuild)

| Existing piece | Where | Reuse |
| --- | --- | --- |
| Screen capture the detector reads | `HarnessScreenReader` in `src/harness/screen.ts` | unchanged; already mirrors the PTY at the rendered width |
| Prompt detection structure | `detectOpencodePermissionGate` in `src/harness/opencode-permission-gate.ts` | change the title and footer predicates only |
| Approval keystroke | `OPENCODE_APPROVAL_KEYSTROKE` | unchanged |
| Auto-approve loop | `HarnessAutoApprover` in `src/harness/auto-approve.ts` | unchanged; it approves whatever the detector matches |

## Proposed changes

1. `src/harness/opencode-permission-gate.ts` — two predicates. `isTitleLine` anchors the title by prefix rather than for equality, so the sidebar text opencode paints onto the same row no longer defeats it. `isConfirmFooter` is replaced by one that accepts the hint whole or clipped: it holds when the row carries `enter conf` followed by end-of-line or `irm`, or carries `⇆ select`. Update the comments to record that opencode paints its sidebar into the panel's own screen rows and clips the hint at the panel's edge, and why the confirm hint is matched as a bounded prefix rather than a whole word.
2. `src/harness/opencode-permission-gate.test.ts` — add the issue's two screens as fixtures and three tests: the wider one, where only the title row costs the match; the narrower one, where the hint is also clipped to `enter conf`; and a panel narrow enough to have clipped the tail before the confirm hint survived.
3. `product/specs/harness.md` — record in the auto-approve section that the opencode prompt is recognized while opencode's own sidebar is on screen, which both appends to the panel's rows and clips the hint the prompt is identified by.

## Tests

`src/harness/opencode-permission-gate.test.ts`:

- matches the external-directory prompt exactly as opencode draws it beside its sidebar, at a width where the whole hint survives and the title's row carries the sidebar's text — the wider screen from `product/backlog/issues.md`
- matches the same prompt at a width where the sidebar also narrows the panel until the hint arrives as `enter conf` — the narrower screen from `product/backlog/issues.md`
- matches a prompt whose hint is clipped further, before the confirm hint's tail survives
- every existing case still holds: whole hint, hint wrapped below the options, a prompt with no `Allow always`, a borderless prompt, ordinary output, the title without an option row, an option row with no hint at all, a hint above the option row, an option row above the title, opencode's `Always allow` stage, and prose mentioning a required permission

No test changes elsewhere: the detector's signature and the approver's contract are unchanged.

## Out of scope

- Reporting the stuck prompt. `HarnessAutoApprover` already badges a gate it matched and could not clear; changing what counts as "stuck" is a separate decision about a different failure.
- opencode's own layout: its sidebar's width, and its clipping of the hint. Both are opencode's, and nothing in this repository misreports the width that produces them.
- claude's and codex's gates. Neither renders a sidebar beside its prompt, and both anchor on tokens that a narrowing panel cannot remove.
- `classifyOpencodeScreen` in `src/harness/busy-classify.ts`. It reads a progress-glyph run and the `esc interrupt` footer, neither of which a sidebar disturbs.

## Verification

- `./scripts/run.mjs check-diff`
- Manual: launch an opencode harness tab with `-y` at a width narrow enough for opencode to show its sidebar, let it ask for an external directory, and confirm the prompt clears on its own and the tab's transcript records `Auto-approved a permission prompt`. Repeat at a width where the sidebar still appears but the hint fits whole.