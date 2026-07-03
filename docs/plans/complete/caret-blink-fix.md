# Fix caret blink animation in editor tab

**Complexity: 1/10** — one CSS character change (`steps(1)` → `steps(2)`), plus a test assertion for the animation.

## Goal

The editor tab shows a blinking vertical bar (caret) at the cursor position. The caret renders correctly as an accent-colored 2px bar, but it never actually blinks — it stays perpetually visible. The blink must work: a hard on/off toggle at 0.5s intervals on a 1-second cycle.

## Root cause

The CSS uses `steps(1)` which defaults to `steps(1, jumpend)` (also known as `step-end`). With this timing function, the animation's only step takes its value from the **last** keyframe (100%). The only defined keyframe is at 50% (`opacity: 0`), so 100% implicitly uses the default `opacity: 1`. The animation never reaches the 50% keyframe, so the caret never becomes invisible.

**Fix:** Change `steps(1)` to `steps(2)`. With two steps:
- Step 1 takes the value at 50% → `opacity: 0` (hidden)
- Step 2 takes the value at 100%/0% → `opacity: 1` (visible)

## Approach

One CSS change plus a test that asserts the animation is present.

## Implementation steps

1. **Fix CSS** — `web/src/theme.css:306`: change `steps(1)` to `steps(2)`.

2. **Add animation test** — `web/src/EditorTab.test.tsx`: add a test that verifies the `.editor-caret::after` element has the `editor-caret-blink` animation applied (using `getComputedStyle`).

3. **Run `./scripts/run.mjs check-diff`** after each step.

## Tests

- `web/src/EditorTab.test.tsx` — new test: caret span has the `editor-caret-blink` animation in its computed style.

## Out of scope

- No changes to the caret DOM rendering (`render.tsx`)
- No changes to the active-tab gating (`EditorTab.tsx`)
- No spec changes (the caret section already exists in `spec/editor-tab.md`)

## Verification

`./scripts/run.mjs check-diff` must pass clean.
