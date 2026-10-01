# Opencode harness auto-approve

**Complexity: 4/10** — one pure, structure-keyed detector plus a table entry; every consumer (command parsing, profile launching, the launch dialog, busy tracking) already derives its behavior from the gate table, so the rest is tests, comments, specs, and docs.

## Goal

Auto-approve opencode's permission prompt the same way claude and codex prompts are answered today. The reported prompt (opencode 1.18) renders like this inside the harness tab:

```
┃
┃  △ Permission required
┃    ← Access external directory /…/web/src/pickers
┃
┃  Patterns
┃
┃  - /…/web/src/pickers/*
┃
┃   Allow once   Allow always   Reject                              ctrl+f fullscreen  ⇆ select  enter confirm
┃
```

## Approach

1. **Add a detector, not a second approver.** A new pure module `src/harness/opencode-permission-gate.ts` exports `detectOpencodePermissionGate(text)` and `OPENCODE_APPROVAL_KEYSTROKE`. `HarnessAutoApprover` keeps owning injection, repeat suppression, stand-down, notifications, and capture links.
2. **Match the prompt by structure.** Each rendered line is trimmed and stripped of opencode's leading `┃` panel border. A gate is: a line that is exactly `△ Permission required`, then a later option row beginning `Allow once` that also offers `Reject`, then a confirm footer containing `enter confirm` on the option row itself or any later line. Variable parts (the request kind, path, patterns, the optional fullscreen hint, whether `Allow always` is offered) stay out of the signature.
3. **Answer with Enter.** opencode's permission prompt is a selected-row menu whose default selection is `Allow once` — the one-time choice. The keystroke is a carriage return, which confirms the highlighted option, never `Allow always`. The rendered text carries no highlight marker, so the detector cannot confirm the selection; the approver acts on the first capture of a new prompt, before a user could move the selection, and the existing loop guard stands down if Enter does not clear it.
4. **Opencode's follow-up stages are left alone.** Choosing `Allow always` by hand leads to a confirmation stage with a different title, and `Reject` to a feedback input; neither carries the `Permission required` title, so neither is answered.
5. **No stale-composer check.** Unlike claude and codex, opencode is a full-screen app that draws the permission prompt in place of its input box and removes it once answered — a resolved prompt does not linger in scrollback above a live prompt. The exact title line, option row, and footer together keep ordinary model output from matching.
6. **Support follows the table.** Registering `opencode` in `GATE_TABLE` makes `supportsHarnessAutoApprove('opencode')` true, so `harness opencode` defaults to auto-approve like claude and codex, `-y`/`--no-auto-approve` behave identically, profile entries default `autoApprove` to true and accept it explicitly, the launch dialog enables the checkbox for opencode (its label is built from the delivered list and becomes "claude, opencode, and codex only"), and busy tracking treats a recognized opencode prompt as an immediate idle-and-waiting state.
7. **Keep the generic unsupported-harness guards.** The command-parse and profile-launch refusals still protect any harness added later without a detector. With every bundled harness now supported they can no longer be reached by a real name, so their tests stub the support predicate instead of naming opencode.

## Implementation steps

1. Add `src/harness/opencode-permission-gate.ts` with the detector and keystroke described above.
2. Register `opencode` in `GATE_TABLE` in `src/harness/auto-approve.ts` and update the table comment.
3. Update comments that name the supported set: `src/harness/command-parse.ts` (the `-y` doc comment and the supported-harness-check comment) and `src/profile/types.ts` (`autoApprove`).

## Tests

- New `src/harness/opencode-permission-gate.test.ts`: positive fixtures for the reported external-directory prompt, a prompt without `Allow always`, a prompt whose footer wraps onto its own line, and one without the `┃` border; negatives for ordinary output, the title without the option row, the option row without the footer, the `Always allow` confirmation stage, a footer that precedes the option row, and prose that mentions `Permission required`. Assert the keystroke is a carriage return.
- `src/harness/auto-approve.test.ts`: replace the "unarmed harnesses" block with opencode routing (matches its gate, claude/codex gates do not match opencode, the opencode gate does not match claude or codex); add a `HarnessAutoApprover` opencode injection case; update `supportsHarnessAutoApprove`, `autoApproveHarnessNames`, and `describeAutoApproveHarnesses` expectations.
- `src/harness/command-parse.test.ts`: opencode now defaults to auto-approve, accepts `-y`, and honors `--no-auto-approve`; the unsupported-harness refusal is pinned with a stubbed predicate.
- `src/harness/index.test.ts`: the two opencode `-y` refusal cases become acceptance cases.
- `src/profile/entry-openers.test.ts`: the refusal case uses a stubbed predicate; add an opencode `autoApprove: true` entry that opens.
- `src/profile/agent-opener.test.ts`: the opencode skip case becomes a launch case.
- `src/harness/manager.test.ts`: the launch view lists all three harnesses as auto-approve capable.

## Specs and docs

- `product/specs/harness.md`: the dialog paragraph, the auto-approve section (supported set, opencode recognition, removing the opencode error and "future work" line), and the busy/ready paragraph on permission prompts.
- `product/specs/profiles.md`: `autoApprove` default and the semantic-check lists.
- `help.md`: the `harness` row.
- `documentation/user-documentation/advanced-agents/harness.md`: dialog, auto-approve, and busy sections.
- `documentation/user-documentation/automation/profiles.md`: `autoApprove`.

## Out of scope

- Selecting opencode's `Allow always` option or launching opencode with a global allow-all permission config.
- Answering opencode's `Always allow` confirmation stage or `Reject` feedback input.
- Removing the generic unsupported-harness guards or the dialog's auto-approve capability list.

## Follow-up

- The launch-dialog documentation screenshot was regenerated in a follow-up change through `./scripts/run.mjs docs-screenshots harness-launch-dialog`, driving the workspace's attached E2E browser, so it shows the "claude, opencode, and codex only" label.
- Changing opencode's busy/ready classifier.
