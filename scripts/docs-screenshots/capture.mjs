// Drives one manifest entry against the run's shared page: types the setup commands into the
// command bar, performs the staged actions, waits for the shot to stabilize, and saves the PNG.
// The page arrives at its launch state — `reset.mjs` puts it there between shots — and the context
// it belongs to is opened once per run in `session.mjs`, not once per shot.
import { typeCommand } from './command-bar.mjs';

const DEFAULT_SETTLE_MS = 800;
const CHILD_CROP_PAD = 12;

async function runActions(page, actions) {
  for (const action of actions) {
    if (action.type !== undefined) await page.keyboard.type(action.type);
    if (action.press !== undefined) await page.keyboard.press(action.press);
    if (action.wait !== undefined) await page.waitForTimeout(action.wait);
  }
}

// The busy dot is fully off for half of every 1.2s blink cycle; wait for its lit phase so the
// still can't catch it dark.
async function stabilize(page, kind) {
  if (kind !== 'busy-dot') return;
  await page.waitForFunction(
    () => {
      const dot = globalThis.document.querySelector('.tab .dot.busy');
      return dot !== null && globalThis.getComputedStyle(dot).opacity === '1';
    },
    undefined,
    { timeout: 10_000 },
  );
}

// The region to capture: the target element's box, optionally narrowed to its children (a tab
// strip is viewport-wide but its tabs occupy the left edge) and/or cut below `clipHeight` (tall
// bodies whose content sits at the top would otherwise be mostly empty space).
async function elementClip(page, entry) {
  const container = page.locator(`[data-doc-shot="${entry.target}"]`).first();
  await container.waitFor({ state: 'visible' });
  const box = await container.boundingBox();
  let { width, height } = box;
  if (entry.cropToChildren) {
    const children = await container.locator(entry.cropToChildren).all();
    let maxRight = box.x;
    for (const child of children) {
      const childBox = await child.boundingBox();
      if (childBox) maxRight = Math.max(maxRight, childBox.x + childBox.width);
    }
    width = Math.min(width, maxRight - box.x + CHILD_CROP_PAD);
  }
  if (entry.clipHeight) height = Math.min(height, entry.clipHeight);
  return { x: box.x, y: box.y, width, height };
}

export async function captureShot(page, entry, outputPath) {
  const setupCommands = entry.setup ?? [];
  for (const command of setupCommands) {
    await typeCommand(page, command);
    await page.waitForTimeout(entry.settle ?? DEFAULT_SETTLE_MS);
  }
  await runActions(page, entry.actions ?? []);
  if (entry.actions?.length) await page.waitForTimeout(400);
  await stabilize(page, entry.stabilize);
  if (entry.target === 'page') {
    await page.screenshot({ path: outputPath });
    return;
  }
  await page.screenshot({ path: outputPath, clip: await elementClip(page, entry) });
}
