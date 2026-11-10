# Fail closed when a bundled ACP adapter is missing

**Complexity: 2/10** — ~7 added lines in 1 production file, 4 requirements and 4 test scenarios (p=4.054).

## Goal

Keep a missing bundled role adapter from resolving to another executable with the same name on the server or interactive-shell PATH.

## Approach

When the install's `node_modules/.bin` does not contain a command declared in `BUNDLED_ACP_ADAPTERS`, return the absolute expected install-local path. The existing ACP spawn then fails with ENOENT without consulting PATH, allowing the role's existing model fallback to continue. Keep installed bundled adapters and unbundled command lookup unchanged.

## Implementation steps

1. Change `locateAcpCommand` in `src/acp/command-path.ts` to return the expected absolute install-local path for an absent bundled adapter, and correct the comments that currently say a bare name cannot fall through to PATH.
2. Update `src/acp/command-path.test.ts` and add spawn-boundary regression cases with same-named executables on the server PATH and interactive-shell PATH. Assert that the child spawn fails for the absent install-local adapter and neither decoy writes its marker. Keep coverage for the installed bundled adapter and unbundled `opencode` shell-PATH lookup.
3. Update `product/specs/acp.md` to describe the fail-closed spawn behavior accurately.
4. Promote this plan and remove the resolved entry from `product/backlog/pull-request.md`.

## Tests

- A missing bundled adapter with a same-named server-PATH executable fails at spawn and does not run the decoy.
- A missing bundled adapter with a same-named executable on the interactive-shell PATH fails at spawn and does not run the decoy.
- An installed bundled adapter still launches from the install-local `.bin` path.
- An unbundled command such as `opencode` still resolves through the interactive-shell PATH when needed.

## Out of scope

- Changing the model fallback flow or its user-facing error behavior.
- Changing command resolution for unbundled adapters.
- Changing the ACP sandbox or spawn boundary beyond the command path selected for a missing bundled adapter.
- Updating user documentation, since this internal adapter lookup behavior is not documented there.
