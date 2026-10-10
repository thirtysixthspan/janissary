import {
  faBell, faBox, faClock, faClockRotateLeft, faComments, faFolderOpen, faListCheck,
  faMagnifyingGlass, faPlug, faRobot, faTerminal, faChevronRight,
} from '@fortawesome/free-solid-svg-icons';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

// The neutral glyph a `launcher.json` icon that this build does not recognise falls back to. A row
// still renders and its command still runs: one bad name costs one glyph and a notifications-feed
// line, not a missing command.
export const LAUNCHER_FALLBACK_ICON: IconDefinition = faChevronRight;

// The icon names a launcher.json may name, against the glyphs this build carries. `launcher.json`
// names raw Font Awesome icon names, which is what lets a project pick its own look without the
// application holding a vocabulary of its own — but the glyph has to exist in the bundle, so the set is
// the one this plugin registers rather than the whole of Font Awesome.
//
// A name that is not here is not an error in the file: the row draws the fallback and the host reports
// it once. Adding a name is adding one line, and nothing else changes.
const ICONS: Record<string, IconDefinition> = {
  faTerminal,
  faRobot,
  faFolderOpen,
  faBell,
  faClock,
  faClockRotateLeft,
  faPlug,
  faComments,
  faMagnifyingGlass,
  faListCheck,
  faBox,
};

// The glyph for a name in `launcher.json`, or the neutral fallback when the name is not one this build
// carries. `known` lets the caller tell the two apart, which is what lets it report an unrecognised
// name exactly once rather than on every render.
export function launchIcon(name: string): { icon: IconDefinition; known: boolean } {
  const icon = Object.hasOwn(ICONS, name) ? ICONS[name] : undefined;
  return icon === undefined
    ? { icon: LAUNCHER_FALLBACK_ICON, known: false }
    : { icon, known: true };
}

// Whether this build can draw the name a `launcher.json` entry carries.
export function isLauncherIcon(name: string): boolean {
  return Object.hasOwn(ICONS, name);
}
