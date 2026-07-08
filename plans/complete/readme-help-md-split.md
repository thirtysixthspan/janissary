# Trim README to install/dev docs; extract in-app help into help.md

**Complexity: 3/10** — mostly content reorganization (moving ~550 README lines into a new file);
one small code change (`buildHelp()` now reads a dedicated file, dropping the regex-extraction
it needed when it lived inside `README.md`); one spec line and one `package.json` field.

## Goal

`README.md` should be limited to install, startup, and developer-specific documentation, with a
link to the public documentation site at the top. The feature/user documentation it currently
duplicates (already covered by `public-documentation/`) should be removed from the README. The
in-app `help` command's source content (the `### Commands` / `### Key Bindings` sections) should
move into a new dedicated `help.md`, and the code that renders `help` should read that file
instead of parsing it out of `README.md`.

## Background (verified)

- `README.md` (943 lines) mixed three kinds of content: (1) install/startup (title, blurb,
  Prerequisites, Usage — lines 1-26), (2) feature/user documentation duplicating
  `public-documentation/` (Commands, Harness tabs, SSH tabs, Configuration, State persistence,
  Root path, Append-only log, Agent messaging, Command comments, Scheduling, Sending input to
  another tab, Profiles, Workspace, Databases, Web browser, Opening files, Connections,
  Interactive programs, External ACP agents, AI monitoring, Key Bindings — lines 28-580), and
  (3) Security + Development (lines 581-943), which is developer-facing and stays.
- Confirmed public-documentation already covers the removed topics: grep hits for
  `transcriptMaxLines`/config.json (`getting-started/startup.md`, `advanced-agents/workspacing.md`),
  and for profiles/scheduling/opening-files/workspace/commands/shell (`automation/profiles.md`,
  `automation/scheduling.md`, `tab-types/opening-files.md`, `advanced-agents/workspacing.md`,
  `command-bar/commands.md`, `command-bar/shell.md`, among others) — so removing this content
  from the README is not a net loss of documentation, only de-duplication.
- `src/commands.ts:28-41` (`buildHelp()`) previously read `README.md` and used two regexes
  (`/### Commands[\s\S]*?(?=^## |^### |$(?![\s\S]))/m` and the equivalent for `### Key Bindings`)
  to extract just those two sections, concatenated, cached in the module-level `helpOutput`. The
  `### Commands` extraction stopped at the next `### Harness tabs` header (lines 28-58); the
  `### Key Bindings` extraction ran until the next `## `/`### ` header, which was `## Security`
  (lines 531-580) — so it already picked up the Image/Markdown/File-tree tab-control tables and
  the trailing `Tab`-completion paragraph too, since those are formatted as **bold** text, not
  markdown headers.
- `specs/application-commands.md:5` documented the `help` command as extracting those two
  sections from `README.md` — needs updating to describe reading `help.md` directly.
- `src/commands/commands.test.ts` (`describe('getOutput')`, `'returns help with commands and key
  bindings'`) asserts the help output `toContain` `'Commands'`, `'Key Bindings'`, `'connection'`,
  `'Ctrl+C'` — content-based assertions that hold regardless of which file backs `buildHelp()`,
  so no test changes were needed.
- `package.json`'s `"files"` array (`bin`, `dist`, `agent-names.json`) controls what ships in the
  published npm package; **`README.md` is auto-included by npm regardless of `"files"`** (npm's
  built-in default), but a new file like `help.md` is **not** auto-included — it had to be added
  to `"files"` explicitly, or `buildHelp()` would fail (silently falling back to the generated
  summary) for anyone who installs via `npm install -g janissary`.
- No GitHub Pages deploy workflow exists yet for `public-documentation/` (no
  `.github/workflows/*.yml`, no `base:` override in `.vitepress/config.mts`). The README's new
  link uses the conventional GitHub Pages URL for this repo
  (`https://thirtysixthspan.github.io/janissary/`), per the issue's explicit "(github site for
  the repository)" wording — actually enabling Pages for that URL to resolve is a separate,
  out-of-scope concern (deployment/CI setup, not a documentation-content change).

## Approach

1. Move the README's title-blurb "learn more" line to point at the public docs site, plus a new
   line pointing at `help.md` for the in-app command/key-binding reference.
2. Delete the entire feature/user-documentation block (lines 28-580) from `README.md`.
3. Create `help.md` at the repo root containing exactly that extracted `### Commands` +
   `### Key Bindings` content (including the tab-control tables and completion paragraph the old
   regex already captured).
4. Simplify `buildHelp()` in `src/commands.ts` to read `help.md` directly (no more regex
   extraction needed, since the file's whole content **is** the help text now).
5. Add `help.md` to `package.json`'s `"files"` array so it ships in the published package.
6. Update `specs/application-commands.md`'s `help` description to reference `help.md`.

## Implementation

1. **`README.md`** — replaced the "Learn more by reading the [documentation]()." placeholder
   line with a real link to the docs site plus an in-app `help` mention; deleted the entire
   feature-documentation block between "### Commands" and "## Security", replacing it with a
   two-line pointer to `help.md` and the docs site.
2. **`help.md`** (new file) — the extracted `### Commands` and `### Key Bindings` sections
   (including the Image/Markdown/File-tree tab-control tables and the `Tab`-completion
   paragraph), verbatim from the removed README content.
3. **`src/commands.ts`** — `buildHelp()` now does
   `path.join(__dirname, '..', 'help.md')` and `readFileSync(helpPath, 'utf8').trim()`, dropping
   the two regex extractions (no longer needed — `help.md`'s entire content is the help text).
4. **`package.json`** — added `"help.md"` to the `"files"` array.
5. **`specs/application-commands.md`** — updated the `help` command description to say it reads
   `help.md` directly rather than extracting sections from `README.md`.

## Tests

No test changes required: `src/commands/commands.test.ts`'s existing `getOutput('help')`
assertions (`toContain('Commands')`, `toContain('Key Bindings')`, `toContain('connection')`,
`toContain('Ctrl+C')`) are content-based and still pass against `help.md`'s content. Verified by
running `./scripts/run.mjs check-diff`.

## Verification

`./scripts/run.mjs check-diff` passes clean (lint, typecheck, tests). Manual: run `janus`, type
`help`, confirm the same Commands/Key-Bindings output as before (now sourced from `help.md`
instead of `README.md`). Not runnable in this environment — note as unverified manually if so.

## Out of scope

- Actually provisioning/deploying GitHub Pages for `public-documentation/` so the new README link
  resolves — that's a CI/deployment task, not a documentation-content change.
- Any change to `public-documentation/` content itself.
- Restructuring the Security or Development sections of `README.md` (kept as-is; both are
  developer-facing).
