# Agent Characters in Documentation

Decorative pixel-art Janissary characters appear throughout the public documentation (`public-documentation/`) as floated sprites that body text wraps around. They add visual rhythm and personality but must follow strict rules so they stay decorative rather than distracting.

## Source images

Agent character images live in `agent-images/` at the repo root. Each character has a subdirectory (`malik/`, `idris/`, `yusuf/`, `fariz/`, `hakim/`, `tahir/`) containing one or more character states, each with eight directional rotations. The VitePress build config (`public-documentation/.vitepress/config.mts`) copies the used facings into `public-documentation/public/agents/` at build time, trimmed and scaled — that directory is gitignored and must not be committed.

## Allowed facings

Only three facings are used in documentation:

| Facing | Filename suffix | View description |
|---|---|---|
| `south` | `-south.png` | Front-facing, toward the viewer |
| `south-east` | `-south-east.png` | Three-quarter view, turned slightly right |
| `south-west` | `-south-west.png` | Three-quarter view, turned slightly left |

**Never use `east` or `west` facings.** Those are complete side views and look flat and unnatural at the small display size used in docs. The `FACINGS` array in `config.mts` controls which rotations are copied — keep it in sync with this rule.

The `north`, `north-east`, and `north-west` facings (showing the character's back) are available in `agent-images/` but not used in documentation.

## The archer

The animated `archer-firing.gif` is the landing-page hero image (`index.md` frontmatter). **The archer must not appear in documentation body pages.** Only the five named characters (malik, yusuf, fariz, hakim, tahir) are used as inline sprites. The idris character is not used in documentation.

## Placement rules

### Count per page

- **1 character** on short pages (under ~30 lines)
- **2 characters** on medium pages (~30–50 lines)
- **3 characters** on long pages (over ~50 lines)

Never place more than 3 characters on a single page, regardless of length.

### Neighboring content

A character sprite must be placed **only next to normal paragraph text or headings** (H1–H4). Never place a character adjacent to:

- Code blocks (fenced or indented)
- Screenshots or other images
- Tables
- Bullet or numbered lists
- Blockquotes

The sprite floats into the body text, so it needs flowing prose beside it to wrap naturally. A character wedged against a table or code block creates an awkward gap.

### Position in the page

Place the character between two block-level elements (heading + paragraph, or paragraph + paragraph, or paragraph + heading). The character tag sits on its own line with a blank line above and below:

```markdown
## Section heading

<img class="agent-float" src="/agents/tahir-south-west.png" alt="" />

Paragraph text that wraps around the sprite...
```

### Alternating sides

Use the `left` class to float a character to the left instead of the default right. Alternate sides across a page when using multiple characters — one right, one left — so the visual weight balances. The CSS class is `agent-float left` for left-floated, `agent-float` alone for right-floated.

### Vary characters across pages

Don't use the same character on consecutive pages in the sidebar order when you can avoid it. Spread the five characters across the documentation so the reader sees variety.

## Adding or changing a character

1. Pick the character and facing from `agent-images/<name>/<state>/rotations/`.
2. Reference it as `/agents/<name>-<facing>.png` in the markdown (the build copies it there).
3. If you need a facing not in the `FACINGS` array in `config.mts`, add it there — the build picks it up automatically on next run.
4. Place the `<img>` tag following the placement rules above.

## Build pipeline

The `copyAgentImages()` function in `config.mts` runs at VitePress config load time. For each character directory under `agent-images/`, it finds the first subdirectory (the character state), then copies each facing listed in `FACINGS` through `trimAndScaleSprite()` (which crops transparent padding and upscales 2x) before writing the result to `public/agents/<name>-<facing>.png`. The animated `archer-firing.gif` is copied as-is without trimming.

Run `npm run docs:dev` to preview changes locally, or `npm run docs:build` to verify the production build.
