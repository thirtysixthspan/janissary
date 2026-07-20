import { loadProfileLayout } from '../profiles.js';
import { getWindowResizer } from '../window-resizer.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

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
      void resize(layout.window.width, layout.window.height);
      notes.push(`Resized window to ${layout.window.width}x${layout.window.height}.`);
    }
  }

  const { sidebarLeft, sidebarRight, tabAreaPct } = layout;
  if (sidebarLeft !== undefined || sidebarRight !== undefined || tabAreaPct !== undefined) {
    messageBus.emit('layout', { type: 'update', sidebarLeft, sidebarRight, tabAreaPct });
    notes.push('Resized sidebars/tab area.');
  }
}
