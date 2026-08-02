# Video tab user documentation

**Complexity: 2/10** — a documentation-only change. One new page in `documentation/user-documentation/tab-types/`, its entry in the docs-site sidebar, and the two existing pages that enumerate what `open` handles and stop short of video. No source change, no spec change.

Video tabs shipped with full internal specs (`product/specs/video-tab.md`, the Video opener section of `product/specs/open.md`) and nothing a user can read. Searching the docs site for "video", "mp4", or "play" returns nothing, so the whole feature — inline playback, the configured external player, the playable/external-only split, the file-navigator gesture — is discoverable only by trying it. Meanwhile `documentation/user-documentation/tab-types/opening-files.md` still tells the reader that what `open` gives them is an image tab, a markdown tab, or a page tab, which is now incomplete.

## Goal

A reader who has never opened the codebase can find out how to play a video in the app, what happens with a format it can't play, and how to point it at a different player — from the docs site's own navigation and search.

## Approach

**One new page, modeled on the image viewer page.** `image-viewer.md` is the closest sibling in job and shape: a lede with the command, a short paragraph on what the tab shows, a control table, and a Lifecycle section. Matching it keeps the tab-types section internally consistent and means a reader who has read one page can skim the other. The page is a **how-to** in Diátaxis terms — reader has a goal ("play this video"), already competent — so it leads with the runnable command and defers the format table and the player configuration below it.

**Two formats sections, because the split is the thing a user will hit first.** The single most surprising behavior is that an `.mkv` opens in QuickTime rather than in a tab. That deserves its own heading with the two format lists spelled out, not a footnote — a reader whose file didn't open in a tab needs to find the answer by scanning headings.

**Document the player setting where the reader will look for it, without duplicating the config reference.** The page states which key to edit and shows the JSON, since `externalViewers` appears on no user-facing page today and a link to a page that doesn't cover it would be a dead end. It stays short and links onward rather than restating the whole configuration story.

**No implementation leakage, no invented screenshots.** Per [[user-documentation]], no file paths, module names, or internal vocabulary. The existing tab-type pages carry `/screenshots/*.png` and `/agents/*.png` images; there is no video screenshot in the repo and the `/agents/` assets are not present in the tree at all, so this page ships without images rather than referencing files that don't exist. A screenshot can be added later by whoever can run the app and capture one.

**Update, don't duplicate, the pages that enumerate `open`.** `opening-files.md` gets video in its example block and in the "what kind of tab you get" link list; its `open external` section gets the video line. That page keeps its job — routing the reader — and the detail stays on the new page.

## What already exists (reuse, don't rebuild)

| Piece | Where |
|---|---|
| The page shape to mirror (lede, control table, Lifecycle) | `documentation/user-documentation/tab-types/image-viewer.md` |
| The `open` routing page that needs video added | `documentation/user-documentation/tab-types/opening-files.md` |
| Docs-site sidebar, "Tab Types" section | `documentation/.vitepress/config.mts:88`–`:100` |
| Source material for the behavior (not to be copied verbatim) | `product/specs/video-tab.md`, `product/specs/open.md` → Video opener |
| Writing rules this page must follow | `ai/guidelines/user-documentation.md` |

## Implementation steps

1. **Write `documentation/user-documentation/tab-types/video-player.md`.** Sections: the lede with `open <video>`; **Formats that play in a tab** (the playable list) and what happens to the rest; **Playback controls**; **Playing while you work in another tab**; **Opening in an external player** including the `externalViewers` setting; **When a video won't play**; **Lifecycle**.

2. **Register it in the docs-site sidebar** — a `{ text: "Video player", link: "/user-documentation/tab-types/video-player" }` entry in the "Tab Types" section of `documentation/.vitepress/config.mts`, placed after "Image viewer" so the two media viewers sit together.

3. **Add video to `opening-files.md`** — a line in the opening example block, the new page in the "what kind of tab you get" link list, and a video line in the `open external` example block.

4. **Add the file-navigator gesture** to `documentation/user-documentation/tab-types/file-navigator.md` only if that page already documents the shift+double-click gesture; if it does, video's inversion of it belongs beside the Markdown one. If it does not, leave the page alone — documenting the gesture from scratch is that page's own job, not this one's.

## Tests

Documentation-only; there is no behavior to test and the docs are not covered by the test suite. Verification is:

- `./scripts/run.mjs check-diff` stays green (the changed `.mts` config is linted and typechecked).
- `npm run docs:build` completes, which is what catches a dead internal link or a sidebar entry pointing at a missing page.
- Read the new page against `ai/guidelines/user-documentation.md`: command before exposition, no file paths or internal names, sentence-case headings, second person, monospace for anything typed.

## Out of scope

- **Screenshots or clips of a video tab.** None exist in the repo and none can be captured here.
- **A user-facing page for `.janissary/config.json` as a whole.** `externalViewers` is described on the video page because that is where a reader needs it; a full configuration reference page is a separate piece of work.
- **Contributor documentation.** `documentation/developer-documentation/` is untouched.
- **Any change to `product/specs/`.** The specs already describe this behavior correctly and completely.
- **Any source change.** No behavior is altered by this plan.
