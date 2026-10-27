# Correct the SSH help signature option order

**Complexity: 2/10** — correct one help signature and its matching behavior-spec signature. Existing parser tests already cover options before the destination and trailing remote-command tokens; no runtime change is needed.

## Goal

Make the SSH command signature show connection options before the destination and the optional remote command after it, matching the documented SSH argument order and existing parser behavior.

## Approach

Use `ssh [ssh options…] <destination> [remote command…]` in both `help/ssh.md` and `product/specs/ssh-tab.md`. Preserve the spec's description that the full invocation is passed through verbatim, and retain the help page's existing `-p`/`-i` and remote-command examples.

## Implementation steps

1. Update the Usage signature in `help/ssh.md` to put SSH options before `<destination>` and add `[remote command…]` after it.
2. Update the command signature in `product/specs/ssh-tab.md` to match, without changing its pass-through behavior description.
3. Remove this resolved item alone from `product/backlog/pull-request.md` and promote this plan to `product/plans/complete/`.

## Tests

- Verify `src/ssh.ts` and `src/ssh.test.ts` cover connection options before the destination and trailing remote-command tokens.
- Run the focused SSH test file and `$janissary/scripts/run.mjs check-diff`.

## Out of scope

- No parser, command execution, or other runtime changes.
- No changes to the SSH examples or explanatory pass-through behavior.
- No changes to the other pull-request backlog entry or other help pages.
