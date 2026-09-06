// The one janissary instance and the one browser page a screenshot run drives, opened once and
// held for every shot. Holding the page is not a convenience: janissary shuts itself down about a
// second after its last websocket client disconnects, so the page the shots are captured through is
// also what keeps the session alive between them. A run that closed a context per shot would race
// its own server's exit in the gap.
import { commandBar } from './command-bar.mjs';
import { killJanus, spawnJanus } from './janus.mjs';

const VIEWPORT = { width: 768, height: 768 };
// 2x (retina) scale, applied to every shot, so doc pages stay crisp without oversized PNGs.
const SCALE = 2;

export async function openSession({ repoRoot, scratch, browser }) {
  const { child, url } = spawnJanus(repoRoot, scratch);
  try {
    const address = await url;
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
    const page = await context.newPage();
    await page.goto(address, { waitUntil: 'networkidle' });
    await commandBar(page).waitFor({ state: 'visible' });
    // The context goes first: dropping the last client is how janissary is asked to quit, and
    // killing the process it is already leaving is then a formality rather than a signal race.
    return {
      page,
      close: async () => {
        await context.close();
        await killJanus(child);
      },
    };
  } catch (error) {
    await killJanus(child);
    throw error;
  }
}
