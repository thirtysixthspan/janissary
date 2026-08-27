import type { CdpPipe } from './cdp-pipe.js';

// Resizes the app's own Chrome window over the CDP pipe transport already opened in `openApp`:
// looks up the window id for the app's page target, then sets its bounds. Only reachable over the
// pipe transport, same as `Extensions.loadUnpacked` in chrome-extension-loader.ts.
//
// `Browser.getWindowForTarget` can't be called with no params here: the pipe connection is a
// browser-level session with no target attached to it (unlike a `--remote-debugging-port` page
// session), so Chrome has nothing to resolve implicitly and replies "No web contents in the
// target." We look up the page target's id via `Target.getTargets` and pass it explicitly.
export async function resizeAppWindow(
  cdp: CdpPipe,
  width: number,
  height: number,
): Promise<void> {
  const { targetInfos } = await cdp.send('Target.getTargets', {}) as {
    targetInfos: { targetId: string; type: string }[];
  };
  const pageTarget = findPageTarget(targetInfos, 'resizeAppWindow');

  const { windowId } = await cdp.send(
    'Browser.getWindowForTarget',
    { targetId: pageTarget.targetId },
  ) as { windowId: number };
  await cdp.send('Browser.setWindowBounds', { windowId, bounds: { width, height } });
}

// Reads the app's own Chrome window size over the same CDP pipe transport as `resizeAppWindow`
// (its get-bounds companion), for `profile save` to capture into a profile's `layout.window`.
export async function getAppWindowBounds(
  cdp: CdpPipe,
): Promise<{ width: number; height: number }> {
  const { targetInfos } = await cdp.send('Target.getTargets', {}) as {
    targetInfos: { targetId: string; type: string }[];
  };
  const pageTarget = findPageTarget(targetInfos, 'getAppWindowBounds');

  const { windowId } = await cdp.send(
    'Browser.getWindowForTarget',
    { targetId: pageTarget.targetId },
  ) as { windowId: number };
  const { bounds } = await cdp.send('Browser.getWindowBounds', { windowId }) as {
    bounds: { width: number; height: number };
  };
  return { width: bounds.width, height: bounds.height };
}

function findPageTarget(
  targetInfos: { targetId: string; type: string }[],
  operation: string,
): { targetId: string; type: string } {
  const pageTarget = targetInfos.find((t) => t.type === 'page');
  if (!pageTarget) throw new Error(`${operation}: no page target found`);
  return pageTarget;
}
