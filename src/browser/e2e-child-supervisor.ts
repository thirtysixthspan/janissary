import { errorText } from '../error-text.js';

// Keeps a `-b` tab's browser alive across the death of any one browser process. The child holds the
// only handle to its browser server, and it is the only process that can relaunch on the same port
// under the same secret path — so a browser that comes back never has to be explained to the parent,
// which reads the child's exit as "the browser is gone" and reports it.
//
// Every effect is injected: the launcher, the reporting sink, the delay, and the give-up callback.
// That is what lets this be tested without a Chromium, and it is why nothing here imports playwright
// or touches `process`.

// The slice of Playwright's `BrowserServer` this needs. Its `close` event fires from the browser
// process exiting and from nothing else, so every close reaching here is a browser that died.
export type SupervisedServer = {
  on: (event: 'close', listener: () => void) => void;
};

// Counted for the child's whole life rather than consecutively. A browser that dies over and over is
// broken in a way relaunching will not fix, and a counter that reset on each success would let a slow
// crash loop run forever. Three absorbs an accident and is small enough to notice.
export const MAX_REPLACEMENTS = 3;

// Playwright closes the old listener and emits `close` in the same statement without awaiting the
// close, so the port may still be held when the replacement tries to bind. These two are what make
// reusing the same port safe rather than a race the common case loses.
export const RELAUNCH_ATTEMPTS = 5;
export const RELAUNCH_DELAY_MS = 250;

export type SuperviseOptions = {
  // The already-running server. The first launch is deliberately not supervised: a browser that never
  // starts at all must fail the way it always has, with the throw reaching the caller.
  server: SupervisedServer;
  launch: () => Promise<SupervisedServer>;
  // One line for the parent's output tail. Nothing is delivered at the moment of a successful
  // replacement — a browser that came back is not a failure — but the lines ride along under the
  // message the user finally reads if the child does exit.
  report: (line: string) => void;
  // The browser will not be replaced again. The caller owns how the process ends.
  giveUp: (reason: string) => void;
  delay: (ms: number) => Promise<void>;
};

export function superviseBrowserServer(options: SuperviseOptions): void {
  let replacements = 0;

  const watch = (server: SupervisedServer): void => {
    server.on('close', () => { void replace(); });
  };

  const attempt = async (): Promise<SupervisedServer | undefined> => {
    for (let tries = 0; tries < RELAUNCH_ATTEMPTS; tries += 1) {
      await options.delay(RELAUNCH_DELAY_MS);
      try {
        return await options.launch();
      } catch (error) {
        options.report(`e2e browser replacement failed to start: ${errorText(error)}`);
      }
    }
    return undefined;
  };

  const replace = async (): Promise<void> => {
    if (replacements >= MAX_REPLACEMENTS) {
      options.giveUp(`e2e browser died ${MAX_REPLACEMENTS} times; not replacing it again`);
      return;
    }
    replacements += 1;
    options.report(`e2e browser died; starting a replacement (${replacements} of ${MAX_REPLACEMENTS})`);
    const replacement = await attempt();
    if (!replacement) {
      options.giveUp('e2e browser could not be replaced');
      return;
    }
    watch(replacement);
  };

  watch(options.server);
}
