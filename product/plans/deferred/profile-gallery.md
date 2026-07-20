# Profile gallery

## Summary

Feature request (verbatim from `product/backlog/features.md`): "Build a Profile gallery in documentation."

A new standalone documentation page, "Profile gallery," showcases the three profiles already shipped and committed in this repo's own `profiles/` directory (`claude`, `coding`, `small-fix`) — real, runnable examples rather than invented ones — so a reader can see what a profile actually looks like on disk and what launching it produces, alongside the existing conceptual "Profiles" page.

## Design decisions

- **New standalone page**, not a new section on the existing Profiles page: `documentation/user-documentation/automation/profile-gallery.md`, added to the sidebar under Automation (after "Profiles"), and cross-linked with a one-line pointer added to the end of the existing `documentation/user-documentation/automation/profiles.md` ("See the profile gallery for real examples.").
- **Content source is the repo's own shipped profiles** — `profiles/claude`, `profiles/coding`, `profiles/small-fix` — not new illustrative examples authored purely for the docs. The gallery is generated from what's actually there, so it can't drift into describing a profile that doesn't exist.
- **Each entry covers the full picture**: a short description of the profile's purpose, its file listing (directory + filenames, mirroring the existing "Writing a profile" example's tree format), the key settings of each entry (model/effort/workspace for harness entries, schedule/context for agent entries), and — for `profiles/claude` specifically, which is the one profile using them — its reserved-file extras (`_files.json` docked file navigator, `_monitors.json` assistant monitor, `_notifications.json` and `_schedules.json` docked tabs), not just the bare entry list.
- **A screenshot per entry**, placeholder for now. This task authors documentation content only; it does not run the app to capture real screenshots. Each gallery entry references a not-yet-existing image path (following the existing `documentation/public/screenshots/` naming convention) and the plan notes that a human must launch each profile and capture the screenshot afterward.

## What already exists (reuse, don't rebuild)

| Concern | Existing code/content |
| --- | --- |
| Conceptual profiles documentation (format, `profile launch`, relaunching) | `documentation/user-documentation/automation/profiles.md` |
| Worked-example format (directory tree, file contents as JSON, prose walkthrough) | `documentation/user-documentation/automation/profiles.md` ("A worked example" section) |
| Sidebar nav entry pattern for a new Automation page | `documentation/.vitepress/config.mts` (Automation section, currently Scheduling / Monitoring with personas / Profiles) |
| Screenshot convention (`/screenshots/<name>.png`, referenced via Markdown image syntax with alt text) | `documentation/public/screenshots/profile-group.png`, used in `profiles.md` |
| The three profiles to document | `profiles/claude/` (four `claude` harness entries + `_files.json`/`_monitors.json`/`_notifications.json`/`_schedules.json`), `profiles/coding/` (three agent entries: `plan`, `execute`, `review`), `profiles/small-fix/` (one `opencode` harness entry) |
| Reserved-file semantics referenced when describing `profiles/claude`'s extras | `product/specs/profiles.md` ("Profile-level monitors" / "file navigator" / "notifications tab" / "schedules tab" sections) |

## Proposed changes

- **`documentation/user-documentation/automation/profile-gallery.md`** (new) — the gallery page. Opens with a short intro sentence, then one section per profile:
  - **`coding`** — three agent entries (`plan`, `execute`, `review`) forming a plan/execute/review loop, each with a distinct `dotColor` and a fixed `number` ordering; `review` also carries a recurring schedule. Description explains the hand-off pattern between the three agents (drawn from each entry's `context` field), shows the directory listing, and links a placeholder screenshot (e.g. `/screenshots/gallery-coding.png`).
  - **`small-fix`** — a single `opencode` harness entry that both runs a one-shot `ai/tasks/fix-a-small-issue.md` execution on launch and re-runs it on a 30-minute schedule. Description, directory listing, placeholder screenshot (`/screenshots/gallery-small-fix.png`).
  - **`claude`** — four `claude` harness entries (`new-features`, `debugging`, `issues`, `planning`, each on a different model/effort) sharing tab group 1, plus its reserved-file extras: a file navigator docked left and rooted at `$root`, an `assistant` monitor watching group 1, and notifications/schedules tabs docked right. Description, directory listing, placeholder screenshot (`/screenshots/gallery-claude.png`).
  - Closes with a pointer back to the "Writing a profile" section of the Profiles page for readers who want to build their own.
- **`documentation/user-documentation/automation/profiles.md`** — add one sentence at the end pointing to the new gallery page.
- **`documentation/.vitepress/config.mts`** — add a `{ text: "Profile gallery", link: "/user-documentation/automation/profile-gallery" }` entry to the Automation sidebar section, after "Profiles".
- **`documentation/public/screenshots/`** — no files added by this task; `gallery-coding.png`, `gallery-small-fix.png`, and `gallery-claude.png` are referenced but must be captured and added by a human afterward (see Open questions / Verification).

## Tests

Documentation-only change; no unit tests apply. Coverage is via the existing docs build:
- `npm run docs:build` must succeed, which will fail loudly on a broken sidebar config or a Markdown page VitePress can't parse (it does not, however, catch a missing/not-yet-captured screenshot file — that's a manual check).

## Out of scope

- Capturing the three placeholder screenshots — deferred to a human, since this task doesn't run the app.
- Authoring any new example profiles beyond the three already shipped in `profiles/`.
- Any change to `profiles/claude`, `profiles/coding`, or `profiles/small-fix` themselves, or to the profile-loading code — this is a docs-only page describing what already exists.
- Restructuring or rewriting the existing "Profiles" conceptual page beyond the one added pointer sentence.

## Open questions

- Exact placeholder screenshot filenames (`gallery-coding.png`, `gallery-small-fix.png`, `gallery-claude.png`) are proposed but not yet captured; a human needs to launch each profile in the app and add the real images to `documentation/public/screenshots/` before the page is complete.

## Verification

- Run `./scripts/run.mjs check-diff`.
- Manual check: run `npm run docs:dev`, navigate to Automation > Profile gallery in the sidebar, confirm all three entries render (directory listings and prose, with broken-image placeholders where the screenshots don't exist yet), and confirm the new sidebar link and the pointer sentence on the Profiles page both navigate correctly.
