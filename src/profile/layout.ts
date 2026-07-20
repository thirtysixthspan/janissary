import { loadProfileLayout } from '../profiles.js';
import { getWindowResizer } from '../window-resizer.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

// Wraps a window resize so a CDP failure (e.g. the app window isn't ready yet) logs a warning
// instead of becoming an unhandled promise rejection that crashes the process.
async function resizeWindow(
  resize: (width: number, height: number) => Promise<void>,
  width: number,
  height: number,
): Promise<void> {
  try {
    await resize(width, height);
  } catch (error) {
    process.stderr.write(`warning: failed to resize app window: ${(error as Error).message}\n`);
  }
}

// Applies a profile's `_layout.json` (window size, sidebar widths, tab-area split) once every
// entry is open, mirroring the other reserved-file openers. Does nothing when the file is absent.
// The window resize is skipped silently when no CDP window connection is registered (`--no-open`,
// or a failed handshake) — see `window-resizer.ts`.
export function applyProfileLayout(profileName: string, _managers: Managers, notes: string[]): void {
  const layout = loadProfileLayout(profileName);
  if (!layout) return;

  if (layout.window) {
    const resize = getWindowResizer();
    if (resize) {
      void resizeWindow(resize, layout.window.width, layout.window.height);
      notes.push(`Resized window to ${layout.window.width}x${layout.window.height}.`);
    }
  }

  const { sidebarLeft, sidebarRight, tabAreaPct } = layout;
  if (sidebarLeft !== undefined || sidebarRight !== undefined || tabAreaPct !== undefined) {
    messageBus.emit('layout', { type: 'update', sidebarLeft, sidebarRight, tabAreaPct });
    notes.push('Resized sidebars/tab area.');
  }
}
