# Public Documentation Plan

Build out `public-documentation/` (the VitePress site, currently just a home page and a single-entry sidebar) into real user-facing docs, working from the internal specs in `specs/`. Follow [[user-documentation]] for content/structure rules (Diátaxis typing, examples-first, no implementation leakage, style) and [[developer-documentation]] for how this plan itself should be maintained. The prose on every page is bound by [[human-writing-guidelines]] (natural, human-sounding sentence-level writing: contractions, active voice, no filler or AI-tell vocabulary, no formulaic structure) — [[user-documentation]] already delegates tone to it, but it applies to each phase's drafting, not as an afterthought. Summary-shaped content — page intros, the Application overview page, section ledes — additionally follows [[strategies-for-readable-summaries]] (lead with the main point, prose over bullets when ideas connect, no restating-the-title openers, no closing recaps). Order below follows the topic list the user prioritized, roughly onboarding-critical first.

Each phase is a self-contained unit: one or more doc pages, sourced from the named spec(s), added to the VitePress sidebar. A phase can ship as its own PR. Every page should end up correctly typed as a Tutorial, How-to, Reference, or Explanation (or a page with clearly separated sections for more than one) — see [[user-documentation]] § "Organize by the Diátaxis framework".

Publishing/hosting (a deploy workflow, GitHub Pages, etc.) is intentionally out of scope for this plan — the repo currently has no CI workflows in-tree, and `npm run docs:dev` / `docs:build` already cover the local loop. Decide hosting separately once there is content worth publishing.

## Phase 0 — Site scaffolding

Before content, set up the structure the rest of the plan drops pages into:

- Expand `public-documentation/.vitepress/config.mts`'s `sidebar` from the single "Introduction" entry into the section groups the phases below fill in, each initially pointing at stub pages. The group → phase mapping, fixed now so stubs match later pages: **Getting Started** ← Phase 1, **Command Bar** ← Phase 2, **Tab Types** ← Phases 3–4 (the editor and file navigator are tab types too), **Advanced Agents** ← Phase 5, **Automation** ← Phases 6–7.
- Decide the URL/file layout now so later phases don't need to move files: flat under `public-documentation/` (e.g. `tabs.md`, `agents.md`) matching the spec filenames, or nested by section (e.g. `command-bar/application-commands.md`). Recommend nested by section, matching the sidebar groups, since the topic list already groups logically.
- Update the home page (`index.md`) hero/tagline only if needed; not a blocker for content phases.
- Add the handful of `data-doc-shot="<name>"` attributes to `web/src/` that the screenshot pipeline needs (see Phase 0.5) — bundle this with the sidebar/layout setup since both are one-time, low-risk groundwork the content phases depend on. (There is no existing `data-testid` convention in `web/src/` to piggyback on; these are the first stable hooks.)

## Phase 0.5 — Screenshot automation pipeline

Most reference/how-to pages below carry a screenshot of the actual UI — but only where the visual genuinely adds information, per [[user-documentation]]'s Visuals guidance ("use them with intent"): pages where a sentence or table does the job (keyboard navigation, standard confirmation dialogs) get none. Capturing the ones we do want by hand doesn't survive the "docs as code, same PR" rule: the web UI will change, and a manually-taken screenshot silently goes stale with nothing to catch it. Automate capture instead, using the app's own web UI (`web/src/`) as the thing being screenshotted — distinct from the in-app `browser` command, which drives *external* pages.

**Stills only, for now.** The Visuals guidance prefers a short loopable clip over a still when the point is motion — and the image tab's zoom/pan is its named example. Recording, optimizing, and embedding clips is meaningfully more pipeline than stills, so v1 deliberately ships stills everywhere and describes motion in prose; extending the manifest with a `clip` entry type is a follow-up once the still pipeline has proven itself. Recording this here so the choice isn't re-litigated page by page.

**Mechanism.** A new script, `scripts/docs-screenshots.mjs` (run via `./scripts/run.mjs docs-screenshots`, per the existing script-runner convention):

1. Spawns `janus --no-open` with `cwd` pointed at a freshly-copied scratch directory seeded from a fixtures folder (`scripts/docs-screenshots/fixtures/` — see below), never the real repo root. Omit `--port` entirely — the CLI picks an ephemeral port itself when none is given, and `--port=0` is a usage error (valid range is 1–65535, per `cli.md`). Also spawn with the `HOME` environment variable pointed at the scratch directory: the global command history lives at `~/.janissary/history.json` (homedir-scoped, not cwd-scoped), so without this a capture run would both read the user's real history (nondeterministic ghost-text/history shots) and pollute it with the setup commands. With cwd and `HOME` both scratch-scoped, a run never touches real `.janissary/` state and is reproducible from a clean checkout.
2. Reads the `__JANUS_URL__ <url>` line from stdout (the same line the CLI already prints on startup — see `cli.md`) to know where to connect; no port-guessing.
3. Drives the page with **Playwright** (already a project dependency via the `browser` feature), launched headless with a fixed viewport (e.g. `1440x900`) so every screenshot in the set is the same size and crop-consistent. Note the browser binary is **not** installed by `postinstall` (that only chmods node-pty's spawn-helper); Chromium comes from the separate `npm run playwright:install-chromium` script. The screenshot script should check for the browser first and fail with a pointer to that command rather than a raw Playwright error.
4. For each entry in a **shot manifest** (`scripts/docs-screenshots/manifest.mjs`): types the listed `setup` command(s) into the command bar (the same text a user would type — `agent bilal`, `open ./sample.png`, `files .`, etc.), waits for the app to settle, optionally performs the listed `actions` (see below), then screenshots either the full page or one element via Playwright's `locator.screenshot()` (cropping to just the relevant region, per the Visuals guidance to crop rather than show the whole window).
5. Saves output to `public-documentation/public/screenshots/<name>.png`, overwriting the previous version — the manifest name *is* the filename, so doc pages reference a stable path (`/screenshots/image-tab.png`) that doesn't change when the script reruns.
6. Kills the spawned `janus` process (and removes the scratch directory) in a `finally`, even if a capture fails partway through, so a failed run never leaves an orphaned server.

**Actions, not just commands.** Several shots show state that no submitted command can produce, so a manifest entry needs an optional `actions` list (key presses and typed-but-not-submitted text, executed after `setup`):

- The image tab's zoom % indicator only appears while zoom ≠ 100% (`image-tab.md`) — the shot needs a `PageUp` press after `open ./sample.png`.
- The history picker is opened by `Ctrl+R`; ghost text needs a prefix *typed without submitting*; tab completion mid-completion needs partial text plus `Tab`.
- The editor's dirty dot needs a character typed into the buffer after `edit ./sample.ts`.
- Multi-tab staging (busy dot, unread badge) needs tab switching, which is `Shift+←/→`, not a command.

One caveat for the `tabs-overview` shot: the busy dot *blinks* — fully off for 600ms of every 1.2s (`tabs.md`) — so a still can catch it dark. Stage busyness with a long-running shell command (e.g. `sleep 30`) in an inactive tab and have the script retry the capture until the dot is in its lit phase, or let the caption carry that it blinks; the unread sparkle badge (staged via `msg` from another tab, or a shell command finishing while unfocused) is steady and needs no such care.

**Stable capture targets.** Matching screenshot regions by CSS class or visible text is brittle — either changes for reasons that have nothing to do with the screenshot pipeline. Add a small, low-risk `data-doc-shot="<name>"` attribute to the handful of container elements the manifest needs to target in `web/src/` (the tab strip, the image view, the editor body, the schedule window, etc.) as part of Phase 0. This is the one piece of `web/src/` source change this plan requires; everything else is additive markup with no behavioral effect.

**Fixtures.** `scripts/docs-screenshots/fixtures/` holds the deterministic inputs each shot needs, copied into the scratch cwd before capture:

- `sample.png` — a small test image (for the Image viewer shot).
- `sample.md` — a Markdown file exercising headings, a list, a table, and a fenced code block (for the Markdown preview shot).
- `sample.ts` — a short TypeScript file (for the Editor shot's syntax highlighting).
- A small nested directory tree (a couple of subdirectories, a few files) for the File navigator shot.
- A tiny static HTTP server (started by the script itself, on another ephemeral port, serving one fixture HTML page) so the Embedded web page shot doesn't depend on the network or any real external site being reachable/stable.

**Manifest shape** (illustrative):

```js
export default [
  { name: 'tabs-overview', setup: ['agent bilal', 'agent cavus'], target: 'tab-strip' },
  { name: 'image-tab', setup: ['open ./sample.png'], actions: [{ press: 'PageUp' }], target: 'image-view' },
  { name: 'markdown-tab', setup: ['open ./sample.md'], target: 'markdown-view' },
  { name: 'editor-tab', setup: ['edit ./sample.ts'], actions: [{ type: '// hi' }], target: 'editor-view' },
  { name: 'history-picker', setup: ['agent bilal', 'files .', 'close'], actions: [{ press: 'Control+R' }], target: 'history-overlay' },
  { name: 'file-tree', setup: ['files .'], target: 'file-tree-view' },
  // ...one entry per phase's screenshot column below
];
```

Adding a screenshot for a later phase (or the cross-cutting follow-up phase) is then just a new manifest entry plus, if needed, one `data-doc-shot` attribute — not new script logic.

**What doesn't get automated.** Harness-dependent shots (`harness claude`, `harness opencode`) require the actual binary installed and authenticated, which isn't guaranteed in every environment this script runs in (a fresh checkout, CI). The script checks for the binary on `PATH` first and **skips that shot with a warning** rather than failing the whole run; those specific images are captured manually once, on a machine with the harness available, and then committed normally like any other doc asset — automation is the default, not a hard requirement for every shot.

**Host-only, like `npm run test:browser`.** Sandboxed workspaces install with `--ignore-scripts`, never download browsers, and the workspace sandbox denies access to Playwright's browser cache (the constraint already documented for the `browser` vitest project in `vitest.config.ts`). So the screenshot script can only run on the host — a workspaced agent implementing a docs phase can stage the page text and manifest entries but must leave screenshot regeneration to a host run, and should say so in the PR.

**Regeneration policy.** Run the script locally (on the host — see above) before opening the PR for any phase that adds or changes a screenshotted page, and commit the resulting PNGs alongside the doc-page changes — same "same PR" rule as the rest of [[user-documentation]]'s docs-as-code section. A CI job that reruns the script and diffs the output against what's committed (to catch UI changes that silently made a screenshot stale) is a reasonable follow-up hardening step — the repo has no CI workflows in-tree today, so it isn't required to start.

## Phase 1 — Application basics

The onboarding path: what the app is, how it starts, and its core object (tabs/agents).

| Page | Type | Source spec(s) | Screenshot | Notes |
|---|---|---|---|---|
| Application (overview/what is Janissary) | Explanation | no single spec — synthesize from `README.md` intro + `application-commands.md` | `app-overview` (the window on first launch, single `janus` tab) | New content, not a spec rewrite. Keep to a few paragraphs: what problem it solves, the tab-based model, pointer to Getting Started. |
| Startup | How-to + Reference | `cli.md`, `relaunch.md`, `application-config.md` | reuses `app-overview` | Flags table (including `--relaunch` and what state it preserves), `--help`/`--version`, startup failures rewritten as troubleshooting ("port already in use" → what to do), startup sequence trimmed to what a user observes (window opens), not the 8-step internal boot order. Include a short "Configuration" section: the `.janissary/config.json` settings table from `application-config.md` (all three settings are user-editable), minus the implementation column. |
| Tabs | Explanation + Reference | `tabs.md`, `root-path.md`, `transcript.md` (user-visible parts only) | `tabs-overview` (strip with several agent tabs: dot colors, a busy/blinking one, an unread badge — see Phase 0.5 on staging these) | Default tab, creating/naming agents, dot colors, busy indicator, unread badge, display alias, `close`. Split "what a tab is" (explanation) from the command reference (`agent <name>`, `close`, `rename`) up front. Fold in the two user-visible transcript behaviors — the `$root` path shorthand readers see in every displayed path (`root-path.md`), and collapsed agent tool steps with `Ctrl+T` to expand (`transcript.md`); the rest of both specs is internal. |
| Groups | Explanation | `tabs.md` § Tab grouping | `tabs-groups` (strip with two distinct group color bars visible) | Could be a subsection of the Tabs page rather than a standalone page — decide during drafting based on length; the topic list breaks it out separately, so default to a separate page unless it ends up too thin to stand alone. |
| Agents | Reference | `agents.md` | reuses `tabs-overview` | The name pool, `agent`/`agent <name>`, `--workspace` pointer forward to the Workspaced Agent page (Phase 5) rather than duplicating it. |
| Keyboard navigation | Reference | `keyboard-navigation.md` | none — table-only page | Straightforward table port; drop the one internal cross-reference to File Tree Tab's own key handling into a prose pointer instead of a spec-style note. |

## Phase 2 — Command bar

Everything about typing at the prompt.

| Page | Type | Source spec(s) | Screenshot | Notes |
|---|---|---|---|---|
| Application commands | Reference | `application-commands.md`, `comments.md` | none — the quit confirmation is a standard dialog, exactly what the Visuals guidance says to skip | `help`, `state`, `clear`, `rename`, `syntax`, `quit`. Fold the key `quit`/`quit-confirmation.md` behavior (why `close` on the last tab also confirms) into this page or the Tabs page — too thin for its own page. Include a short "Command comments" section from `comments.md`: `## comment ##` stripping is behavior a user can type, and scheduled firings visibly use it (`<command> ## scheduled ##`). |
| Tab completion | Reference | `tab-completion.md` | `tab-completion` (input line mid-completion, showing the candidate list — needs a typed-prefix + `Tab` action, per Phase 0.5) | Port the contextual rules table directly; it's already reference-shaped. |
| Shell commands | How-to + Reference | `shell.md` | `shell-output` (a shell command's output rendered in the transcript) | User-facing surface only: the persistent per-tab shell, running a shell command, interactive-program (PTY) takeover and what that looks like. Drop the internal delimiter/streaming mechanism entirely (implementation leakage). |
| History | Reference + Explanation | `history.md` | `history-picker` (`Ctrl+R` overlay open over a populated history) plus `ghost-text` (a suggestion shown inline) — both need `actions`, and the setup commands themselves populate the history they show | Up/Down recall, click-to-execute, ghost text, `Ctrl+R` picker, the cap. Keep the global-vs-per-tab distinction since it's user-observable behavior, not internal. |

## Phase 3 — Tab types (view tabs)

The non-agent view tabs opened via `open`/`files`.

| Page | Type | Source spec(s) | Screenshot | Notes |
|---|---|---|---|---|
| Opening files and pages (`open`) | How-to + Reference | `open.md` | reuses the three below | The dispatcher itself, `open`/`open external`, wildcards. This is the natural landing page that the next three link out from, rather than repeating "how tabs are created" on each. |
| Image viewer | Reference | `image-tab.md` (+ `open.md` § Image opener) | `image-tab` (`sample.png` open, zoomed one step so the zoom % indicator is visible — it only shows while zoom ≠ 100%) | Zoom/pan controls, tab-strip behavior. Motion (zoom/pan feel) stays prose-described for now — see Phase 0.5 § "Stills only". |
| Markdown preview | Reference | `markdown-tab.md` (+ `open.md` § Markdown opener) | `markdown-tab` (`sample.md` rendered — headings/list/table/code fence all visible) | Rendering/appearance, scrolling. Do not pull in `markdown-rendering.md`'s ACP-reply-streaming material — that's a different feature (agent chat rendering) that happens to share a rendering pipeline; out of scope for this page. |
| Embedded web pages | Reference + Explanation | `embedded-web-page.md` | `page-tab` (the fixture HTML page loaded, `<n>) <domain>` tab label visible) | What renders and what doesn't (no scripting/reading the page), page numbering, closing. |

## Phase 4 — Editor and file navigator

| Page | Type | Source spec(s) | Screenshot | Notes |
|---|---|---|---|---|
| Editor | How-to + Reference | `editor-tab.md` | `editor-tab` (`sample.ts` open, syntax highlighting visible, dirty-dot state — needs a typed character, per Phase 0.5) | Opening/creating files, saving, unsaved-changes dialog, syntax highlighting and `syntax theme` switching. Skip focus-protection and IME-composition internals unless they cause user-visible quirks worth documenting. |
| File navigator | Reference | `file-tree-tab.md` | `file-tree` (fixture tree, one directory expanded) | `files [path]`, mouse/keyboard interactions tables, watching behavior (user-visible: the tree auto-updates). |

## Phase 5 — Harness and workspacing

More advanced; assumes the reader is past onboarding.

| Page | Type | Source spec(s) | Screenshot | Notes |
|---|---|---|---|---|
| Harness | How-to + Reference | `harness.md` | `harness-tab` (a running harness's PTY body) — **manual capture**, harness binary required (see Phase 0.5 § "What doesn't get automated") | `harness <name> [as <label>] [-w]`, input model, lifecycle. Mention `ssh-tab.md` as a related, simpler variant (`ssh <destination>`) rather than giving it a full separate page unless usage data says otherwise. |
| Workspacing | Explanation | `sandbox.md`, `workspaced-agent.md` § Isolation | none — concept page, no new UI to show | A *concept* page: why workspaces exist (disposable, isolated clones) and what isolation means for the user in practice (no global installs, `.ssh` unavailable inside without a token) — a heavily trimmed summary. `sandbox.md` is almost entirely internal (Seatbelt rule tables, OS quirks); none of that belongs here, only the user-facing consequences section. |
| Workspaced agent | How-to + Reference | `workspaced-agent.md` | `workspaced-agent` (connections panel showing the workspace path, or the `$root/workspace/<name>` notice) | `agent <name> --workspace` / `harness <name> -w`, GitHub auth (token requirement for push/`gh`), lifecycle (created/removed with the tab). Cross-links back to Workspacing for the "why." |

## Phase 6 — Scheduling

| Page | Type | Source spec(s) | Screenshot | Notes |
|---|---|---|---|---|
| Scheduling | How-to + Reference | `scheduling.md` | `schedule-window` (the floating schedule panel with a couple of entries) | Schedule forms table, `in <tab>` targeting, management (`list`/`cancel`/`clear`), the schedule window. Drop `ScheduleManager`/`computeNextRun` and other implementation names; keep firing *behavior* (retries if harness isn't running yet) since that's user-observable. |

## Phase 7 — Profiles

| Page | Type | Source spec(s) | Screenshot | Notes |
|---|---|---|---|---|
| Profiles | How-to + Reference | `profiles.md` | `profile-group` (tab strip after `profile launch`, showing the profile's group color band) | `profile launch`/`profile list`, entry schema (agent vs. harness entries), relaunch/collision behavior. This is the natural capstone page since it composes agents, harnesses, workspaces, and schedules covered in every earlier phase — good place to end with a worked example that ties them together. |

## Spec coverage

Every file in `specs/` is accounted for, so the follow-up phase doesn't have to re-derive what was deliberately left out:

- **Assigned to a phase above**: `cli.md`, `relaunch.md`, `application-config.md`, `tabs.md`, `root-path.md`, `agents.md`, `keyboard-navigation.md`, `application-commands.md`, `quit-confirmation.md`, `comments.md`, `tab-completion.md`, `shell.md`, `history.md`, `open.md`, `image-tab.md`, `markdown-tab.md`, `embedded-web-page.md`, `editor-tab.md`, `file-tree-tab.md`, `harness.md`, `ssh-tab.md` (folded into Harness), `sandbox.md` (user-facing consequences only), `workspaced-agent.md`, `scheduling.md`, `profiles.md`, and the user-visible slivers of `transcript.md`.
- **Follow-up phase** (real features not in the user's ordered list): `messaging.md` (`msg`/`broadcast`), `send.md`, `connection.md`, `database.md` (`db`), `browser.md`, `acp.md`, `monitoring.md`. Same per-spec approach, including adding their screenshots to the Phase 0.5 manifest.
- **Excluded — internal-only, no user-facing page**: `append-only-log.md`, `application-state.md`, `command-routing.md`, `state-directory.md`, `markdown-rendering.md` (agent-chat rendering internals; the *markdown tab* is covered in Phase 3), and the internal remainders of `transcript.md`, `root-path.md`, and `sandbox.md`.

## Cross-cutting, ongoing

- As each phase lands, update Phase 0's sidebar config to add the new pages under the right group.
- Apply [[developer-documentation]]'s docs-as-code rule to this plan itself: move it to `plans/ready/` once the phase breakdown and page-type decisions above are confirmed, and to `plans/complete/` once Phase 7 ships (or split completion per-phase if that reads better once underway).

## Completion notes

All phases (0 through 7) shipped together in one pass, nested-by-section layout as recommended (`getting-started/`, `command-bar/`, `tab-types/`, `advanced-agents/`, `automation/`). Deviations and decisions made during implementation:

- **Capture scale and cropping.** Shots are captured at 2× (retina) device scale, uniformly across the set, so doc pages stay crisp without oversized PNGs. Two manifest options were added beyond the illustrative shape: `cropToChildren` (the tab strip spans the viewport but its tabs occupy the left edge — the crop narrows to the tabs' extent) and `clipHeight` (tall bodies whose content sits at the top, like the file tree, would otherwise be mostly empty space).
- **One app process per shot.** Each manifest entry gets a fresh scratch directory (cwd and `HOME` both scratch-scoped) and its own `janus` process, so captures are deterministic and independent of shot order — earlier shots' commands can't leak into a later shot's ghost-text/history state.
- **The server is spawned directly** (`dist/main.js`, or `tsx src/main.ts` in a dev checkout) rather than via `bin/janus.mjs`, whose `spawnSync` child would outlive a kill of the launcher and leave an orphaned server.
- **The harness shot auto-captures when `claude` is on `PATH`** (the skip-with-warning path only fires when it's absent). With `HOME` scratch-scoped the harness shows its first-run screen, which is what a fresh `harness claude` looks like — replace `harness-tab.png` with a manually captured working-session shot if that ever reads as misleading.
- **The workspaced-agent shot** stages a real clone: the scratch directory is a git repo with a local bare `origin`, so `agent emrah --workspace` works without network access.
- **Setup commands always use the explicit `shell ` prefix** where a shell command is intended, so probabilistic routing can never open the route chooser mid-capture.
- The follow-up phase (messaging, send, connection, db, browser, acp, monitoring) remains open, as planned.
