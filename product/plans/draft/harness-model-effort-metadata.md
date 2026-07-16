# Harness model and effort in the metadata row

**Complexity: 2/10** — two optional payload fields carried through an existing passthrough plus a small chip render in one shared component; no new protocol message, RPC, or persistence.

## Summary

A harness tab's metadata row currently shows `<cwd> <flag-emojis> 📁`. This feature adds the harness's launch **model** and **effort level** to that row, so a harness launched with `--model`/`--effort` (via the command or the launch dialog) advertises them at a glance. The order becomes `<path> <model> <effort> <flags>`: the model and effort appear as small chips between the working directory and the flag emojis. Each chip is only shown when that value was actually set at launch — a harness launched with neither flag looks exactly as it does today. Hovering a chip shows a tooltip identifying it as the Model or Effort (and carrying the full, untruncated value when the visible text is CSS-truncated). Only harness tabs get these chips; agent (ACP) and shell tabs' metadata rows are unchanged.

Today the model/effort are parsed from the launch command and passed straight to the harness binary via `buildHarnessCommand`, then discarded — they are not kept on the tab. This feature stores them on the harness payload so they can travel to the client and be displayed.

## Design decisions

- **Placement and order.** Model and effort render between the path and the flag emojis, matching the literal `<path> <model> <effort> <flags>`. The right-aligned 📁 file-navigator button stays at the end.
- **Chips with tooltips.** Each value renders as a small styled chip (not plain text), consistent with how the flag emojis already read as discrete tokens. Hovering a chip shows a tooltip naming it — "Model" / "Effort".
- **Omit when unset.** A chip appears only when its value was set at launch. If only one of model/effort was given, only that chip shows; if neither was given, the row is identical to today's (path + flags). No placeholder is rendered for a missing value.
- **Verbatim value, truncate-with-tooltip.** The chip shows the exact `--model` / `--effort` value passed at launch, verbatim. Long values (e.g. `opencode-go/deepseek-v4-pro`) may be CSS-truncated in the row, with the full value available on hover — combined with the label into a single tooltip (e.g. `Model: opencode-go/deepseek-v4-pro`) so one hover conveys both what it is and its full value.
- **Harness tabs only.** Only harness-view tabs show these chips. Agent tabs (which carry a separate ACP provider/model in the `acp` field) and shell tabs are untouched — this feature is specifically about harness launch model/effort.

## What already exists (reuse, don't rebuild)

| Concern | Existing thing to reuse | Where |
| --- | --- | --- |
| Metadata row rendering (cwd + flags + 📁 button) | `AgentTabMeta` | `web/src/AgentTabMeta.tsx` |
| Flag emoji + tooltip pattern (chip-like tokens with `title`) | `tabFlagDisplay`, `.tab-flag` styling | `web/src/tab-flag-display.ts`, `web/src/theme.css` |
| Harness payload on the wire | `HarnessView` | `src/types.ts:58` |
| Harness payload passed through to the client untouched | `buildTabView` (`harness: tab.harness`) | `src/tab/view.ts:42` |
| Model/effort already parsed and available at launch | `spawnTab`'s `model`/`effort` params | `src/harness/manager.ts:116` |
| Harness tab rendering that already receives `HarnessView` | `HarnessTab` | `web/src/HarnessTab.tsx` |

## Proposed changes

**`src/types.ts` — `HarnessView`.** Add optional `model?: string` and `effort?: string` fields. Because `buildTabView` already forwards `tab.harness` verbatim, no change is needed in `src/tab/view.ts`.

**`src/harness/manager.ts` — `spawnTab`.** When constructing the `HarnessView` (currently `{ name, program, ptyId: '', status: 'running' }`), include `model` and `effort` when they are defined. Both values are already parameters of `spawnTab`, so this is purely carrying them onto the payload; no change to how they're passed to `buildHarnessCommand`.

**`web/src/AgentTabMeta.tsx`.** Accept optional `model?`/`effort?` props and render a chip for each that is set, positioned after the `<span className="tab-cwd">` and before the `<span className="tab-flags">` (so the visual order is `<path> <model> <effort> <flags>`). Each chip uses a `title` combining the label and full value (`Model: <value>` / `Effort: <value>`) and an `aria-label` of the label, mirroring how the flag `<span className="tab-flag" …>` at `web/src/AgentTabMeta.tsx:15` exposes `title`/`aria-label`. `AgentTabMeta` is shared by three callers — `AgentTabBody.tsx:86` (agent tabs), `HarnessTab.tsx:41` (harness tabs), and `ShellTab.tsx:31` (shell tabs) — but only `HarnessTab` passes the new props, so the other two render exactly as before (the props default to `undefined`).

**`web/src/HarnessTab.tsx`.** Pass `harness.model` and `harness.effort` into `AgentTabMeta` (line 41) alongside the existing `cwd`/`flags`/`onOpenFileNavigator` props. `HarnessTab` already receives the full `harness: HarnessView` (line 26), so the new fields are available without a signature change.

**`web/src/theme.css`.** Add a `.tab-meta-chip` (or similarly named) rule for the chip's appearance — a compact token consistent with the existing `.tab-flag`/metadata styling — with truncation styling (e.g. `max-width` + `text-overflow: ellipsis`) so long model strings are clipped while the full value remains available via the `title` tooltip.

## Tests

- **`web/src/HarnessTab.test.tsx`** — extend the existing harness-tab tests: a harness with both `model` and `effort` renders both chips, in order, between the cwd and the flags; a harness with only one renders only that chip; a harness with neither renders no chips (row matches today's output); the chip's `title` carries the `Model: <value>` / `Effort: <value>` text.
- **`web/src/AgentTabMeta` coverage** (via the harness-tab test or a dedicated `AgentTabMeta.test.tsx`) — passing no `model`/`effort` props leaves the row unchanged (guards agent/shell tabs).
- **Server (`src/harness/manager.test.ts` or `src/harness/index.test.ts`)** — launching a harness with `--model`/`--effort` results in a `HarnessView` carrying those values; launching without them leaves both undefined.
- Follow the colocated `*.test.ts(x)` convention already used in each area (vitest `server`/`client` projects).

## Out of scope

- Surfacing the ACP agent's provider/model on agent tabs (the `acp` field) — agent and shell tabs' metadata rows are unchanged.
- Any placeholder/"default" indicator for an unset model or effort — unset values are simply omitted.
- Making the chips interactive (clicking to change model/effort at runtime) — display only.
- Validating or normalizing the effort value for display — it is shown verbatim, matching the launch behavior of passing `--effort` through unvalidated.
- Persisting model/effort across `--relaunch` — harness tabs are in-memory and not restored (per `harness.md`), so nothing new is persisted.

## Open questions

None.

## Verification

- `./scripts/run.mjs check-diff` — lints changed files, incrementally typechecks the affected projects, and runs the affected server and web tests.
- Manual: run the app, launch `harness claude --model <name> --effort high` (or use the launch dialog), and confirm the harness tab's metadata row shows the model and effort chips between the path and the flag emojis, that hovering each chip shows the `Model: …` / `Effort: …` tooltip with the full value, and that a plain `harness claude` shows no chips. Verify an agent tab and a shell tab still render their metadata rows unchanged.
