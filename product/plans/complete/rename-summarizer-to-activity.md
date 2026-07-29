# Rename summarizer.md persona to activity.md, narrow its scope, and add it to the multitasking profile

**Complexity: 2/10** — a persona file rename plus rewrite (personas are discovered dynamically from the filesystem, so nothing else needs to reference the name), one JSON edit to a checked-in profile, and a one-line doc update; no code changes.

## Summary

Per the backlog: "update the summarizer.md persona have its only job to be to summarize the recent activity of open tabs. Use assistant.md as a model. Rename summarizer.md to activity.md. set the model to opencode:opencode/deepseek-v4-flash-free:default. add activity monitor to the multitasking profile."

`ai/personas/monitor/summarizer.md` currently only handles one input kind (harness output) and periodically recaps a long-running session's decisions/open-questions/next-steps. `ai/personas/monitor/assistant.md` (the persona to model the new file's shape on) instead branches on the *kind* of activity it just saw — harness output, web page output, or user input — and pairs each branch with clear, low-noise instructions (never a bare acknowledgment, silence when there's nothing to say, never negative about the user). The renamed `activity.md` persona keeps assistant.md's harness/web-page branching and phrasing conventions but drops the "user input → suggestions" branch entirely and never suggests anything — its only job, across every kind of tab it watches, is summarizing recent activity so the user can follow along without reading the raw transcript.

## Design decisions

- **File is renamed, not duplicated.** Personas are loaded by filename (`src/personas.ts`'s `loadPersona`/`listPersonas` read `ai/personas/monitor/<name>.md` directly, discovering names via `readdirSync`) — there is no separate registry to update. `summarizer.md` is removed and `activity.md` added in its place; the persona's runtime name becomes `activity`.
- **Scope: summarize every tab kind the monitor can see, never suggest.** The current `summarizer.md` only reacts to harness output; the renamed persona also summarizes web page tab output (mirroring `assistant.md`'s existing harness/web-page split), so "recent activity of open tabs" covers both kinds a monitor can be pointed at. The user-input branch and every suggestion-related instruction from `assistant.md` are dropped — `activity.md` is summarize-only, matching `summarizer.md`'s original single-purpose framing.
- **Model directive changes to `opencode:opencode/deepseek-v4-flash-free:default`** (currently `opencode:google/gemini-3.1-flash-lite:default`), per the backlog's explicit instruction.
- **Keep the existing "silence over noise" and "never negative" conventions**, both already present in `summarizer.md` and `assistant.md`, carried into `activity.md` largely verbatim since they're small, precedented, and not something the backlog asks to change.
- **Add to `profiles/multitasking.json` as a `group:1`-targeted monitor**, mirroring the existing precedent in `profiles/features.json` (`{ "name": "assistant", "persona": "assistant", "targets": ["group:1"] }`) — `multitasking.json`'s own agent/harness/editor entries are all in `group: 1`, so `group:1` is the target that covers everything the profile opens.
- **Update the one documented example that names `summarizer`.** `documentation/user-documentation/automation/monitoring.md`'s `monitor summarizer group:2` example command names a persona that will no longer exist; renamed to `monitor activity group:2` so the doc keeps working as a copy-pasteable example.

## What already exists (reuse, don't rebuild)

| Need | Existing thing | Location |
| --- | --- | --- |
| Dynamic persona discovery (no registry to touch) | `loadPersona`/`listPersonas` reading `ai/personas/monitor/*.md` by filename | `src/personas.ts:25-60` |
| The harness-directive line format (`<harness>:<model>:<variant>`) | `parseDirective` | `src/persona-parsing.ts:36-57` |
| The style/structure to model the rewrite on | `ai/personas/monitor/assistant.md` | its harness/web-page/user-input branching, "always write the summary", "never say anything negative" conventions |
| Profile-level monitor entry shape (`{ name, persona, targets }`) | precedent monitor entry | `profiles/features.json:22-24` |

## Implementation steps

1. Write `ai/personas/monitor/activity.md`:
   - First line: `[//]: # opencode:opencode/deepseek-v4-flash-free:default`
   - Body: an activity-summarizing monitor persona modeled on `assistant.md`'s structure — branching on **harness output** (summarize what the AI has done/is doing/trying to do, without guessing at run state, per `assistant.md`'s existing caveat) and **web page tab output** (summarize the page's content/state) — but with no suggestion behavior at all: no user-input branch, no suggestion-quality bar, no "you never run commands and never take action" framed around suggestions — instead framed purely around summarizing. Keep `summarizer.md`'s "if nothing meaningful has changed, respond with nothing at all" rule and both files' shared "never say anything negative about the user or their work" paragraph.
2. Delete `ai/personas/monitor/summarizer.md`.
3. In `profiles/multitasking.json`, add a top-level `"monitors"` key (after `"editors"`, before `"files"`, matching the key ordering `profiles.md` lists): `[{ "name": "activity", "persona": "activity", "targets": ["group:1"] }]`.
4. In `documentation/user-documentation/automation/monitoring.md`, change the example `monitor summarizer group:2` to `monitor activity group:2`.

## Tests

This is a content-only change (a persona prompt file and two config/doc files) with no new code paths — `listPersonas('monitor')`/`loadPersona` are already covered by existing tests that don't assert on specific persona names, and no test asserts on `summarizer.md`'s file existing. No new automated tests apply; verified instead by:

- `./scripts/run.mjs check-diff` passing (confirms nothing in `src/`/`web/src/` references the old name).
- Manually confirming `ai/personas/monitor/activity.md` parses: its directive line matches `<harness>:<model>:<variant>` and its `harness` (`opencode`) is one of the two recognized values.
- Confirming `profiles/multitasking.json` is valid JSON and its `monitors` entry matches the `{ name, persona, targets }` shape documented in `product/specs/profiles.md`.

## Out of scope

- Any change to `ai/personas/monitor/assistant.md` itself, or to any other persona file.
- Changing `src/personas.ts`, `src/persona-parsing.ts`, or any code path — persona loading is already filename-driven and needs no update for a rename.
- The unrelated `summarizer` string literals in `web/src/editor/*.test.ts` and `src/harness/auto-approve.test.ts` — those are fixture data for the *editor* persona kind and shell-output examples, respectively, not references to this monitor persona file.
