# Agent names with dots persist their state

Bug: after changing an agent name using the tab label, Janissary warned
`failed to persist agent state for 10.27.1.94: Invalid agent name: "10.27.1.94"`.

Complexity: 3/10

## Root cause

An agent tab's label is the agent's name, and labels are not restricted to the
preset pool: `agent 10.27.1.94` (a name the user supplies; e.g. an IP address), a
profile entry's `name`, or a harness `as <label>` all become the tab label
verbatim. Persistence, however, validates the label with `/^[\w-]+$/` before
turning it into a filename, so any label outside `[\w-]` throws
`Invalid agent name` out of `agentStatePath` (`src/agent/state.ts`). Every write
for such a tab fails, the warning fires, and the agent's saved state (history,
cwd, context, alias) is silently absent on the next `--relaunch`.

The transcript store carries the identical guard
(`/^[\w-]+$/` in `src/transcript/store.ts`), so the same tab also loses its
transcript with `Invalid transcript label` — confirmed by direct probe.

The guard's real job is traversal safety: the label becomes a single filename
inside the state/transcript directory, and must never address a path outside it
(no `/`, no `\`). Dots inside a name cannot traverse once separators are
excluded, and the trailing `.json` the stores always append defeats the bare `..`
shape. The codebase's own convention (`src/harness/artifact-name.ts`) already
states that a tab's label is legitimate even when it holds filename-hostile
characters; the persistence stores must follow it rather than reject the label.

## Correct behavior

Agent state and the per-tab transcript persist for every label the app actually
gives a tab, as long as the label forms a safe single filename: no path
separators (`/`, `\`) and no NUL. A name like `10.27.1.94` persists as
`10.27.1.94.json` and round-trips on `--relaunch`. Path-traversal labels
(`../sibling`, `agent/sub`) keep being rejected.

## Reproduction

- Automated (regression tests, watched failing before the fix):
  - `src/controller.test.ts` — `agent 10.27.1.94 --no-workspace` then
    `loadAgentState('10.27.1.94')` threw `Invalid agent name: "10.27.1.94"`.
  - Renaming such a tab via the tab label (alias commit →
    `renameTab`) triggered the same throw from the persist call.
- Manual probe: `TranscriptStore.save('10.27.1.94', …)` warned
  `failed to persist transcript for 10.27.1.94: Invalid transcript label`, and
  `TranscriptStore.load('10.27.1.94')` threw out of `path()`.

## Approach

- `src/agent/state.ts`: widen `VALID_NAME` from `/^[\w-]+$/` to `/^[\w.-]+$/`
  and spell out the guard's purpose in the comment next to it (traversal-safe,
  not label-restrictive). The error message, `agentStatePath`, and every caller
  stay unchanged.
- `src/transcript/store.ts`: the same widening, same reasoning — the label is
  the file stem and only separators are dangerous.

Both stores keep rejecting `/` (traversal) and `\` (Windows separator safety);
everything else about their write/read/remove paths is untouched.

## Implementation steps

1. Widen the guard in `src/agent/state.ts`; adjust the adjacent comment.
2. Widen the guard in `src/transcript/store.ts`.
3. Tests:
   - `src/agent/state.test.ts`: a dotted name builds a path inside the state
     directory; traversal names still rejected (already covered — keep).
   - `src/transcript/store.test.ts`: a dotted label saves, loads, and clears.
   - `src/controller.test.ts`: the two user-flow regressions (creation with
     `agent 10.27.1.94`, and alias persistence through the tab-label rename)
     already written red.
4. Spec: `product/specs/state-directory.md` states that persistence accepts any
   agent name that is safe as a single filename, so names like `10.27.1.94`
   save and restore.

## Verification

- `./scripts/run.mjs check-diff` after each step.
- Re-run the reproduction tests with the fix in place — the two controller tests
  plus the store tests must pass; they failed against the unfixed code.

## Regression tests

- `src/controller.test.ts` — `persists agent state for an agent named after an
  IP address without warning` and `persists the alias set through the tab label
  on a dotted agent name` (written red first, then green with the fix).
- `src/agent/state.test.ts` — dotted-name path acceptance beside the existing
  traversal-rejection cases.
- `src/transcript/store.test.ts` — dotted-label transcript round-trip.

## Out of scope

- Labels holding spaces or other non-`\w` characters: same class of latent
  failure, but unreported, and admitting them trades against reserved-filename
  characters on other filesystems. Left as is.
- `src/database/parsing.ts`'s database-name guard: a different subsystem with a
  user-facing rejection at `connection open` time, not part of this flow.
- The harness artifact filename sanitizers (`browser-log`, capture, recording),
  which already sanitize hostile labels correctly.
