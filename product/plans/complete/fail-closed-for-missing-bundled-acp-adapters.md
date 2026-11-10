# Fail closed for missing bundled ACP adapters

**Complexity: 3/10** — ~12 added production lines across 2 existing files, 4 requirements, and 7 scenarios (p=4.53)

## Goal

When a role entry uses Janissary's bundled Claude or Codex ACP adapter, launch only the copy installed with Janissary. If that adapter is missing from the install's own `node_modules/.bin`, fail the launch so the role can continue through its existing model fallback instead of running an unrelated same-named command from the server or interactive shell PATH.

## Approach

Keep the bundled adapter command names in one module and use them both when `acpLaunchForEntry` builds Claude and Codex launches and when `locateAcpCommand` decides whether a missing command may fall through. A bundled name that misses the install-local `.bin` lookup returns unchanged with the original environment before either PATH lookup. Other agent commands keep the existing PATH and interactive-shell resolution behavior.

Update the resolver's header and function comments to explain this fail-closed rule, and update `product/specs/acp.md` to state that a missing bundled adapter fails the role entry rather than running a PATH copy.

## Implementation steps

1. Add a shared constant for the Claude and Codex adapter commands, use it in role launch construction and command resolution, and update the resolver comments.
2. Add tests for the shared adapter roster and for missing `codex-acp` candidates on the server PATH and interactive-shell PATH. Keep the existing `opencode` resolution cases as coverage for unbundled commands.
3. Update the ACP spec's bundled-adapter paragraph and run the diff-scoped checks.

## Tests

- In `src/acp/bundled-adapters.test.ts`, assert that the shared adapter command names equal the commands returned by `acpLaunchForEntry` for Claude and Codex. Keep the existing pinned-version and installed-bin checks.
- In `src/acp/command-path.test.ts`, with `codex-acp` missing from the install `.bin` but present on the server PATH, assert lookup returns the bare command and the same environment object.
- In `src/acp/command-path.test.ts`, with `codex-acp` missing from the install `.bin` and server PATH but present in the interactive shell PATH, assert lookup returns the bare command and the same environment object.
- Preserve coverage that a bundled adapter present in `.bin` is selected ahead of PATH and gets the server Node path as needed.
- Preserve the existing `opencode` server-PATH and interactive-shell fallback coverage.

## Out of scope

- Changing the role model fallback, remote ACP transport, sandbox rules, or adapter package dependencies.
- Editing the earlier completed adapter plan or changing any later backlog entry.
- Changing PATH resolution for unbundled agent commands.
