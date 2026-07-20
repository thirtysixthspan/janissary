import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  ProfileFilesEntry, ProfileLayout, ProfileMonitor, ProfileNotificationsEntry, ProfileSchedulesEntry,
} from './types.js';

function isProfileMonitor(value: unknown): value is ProfileMonitor {
  if (typeof value !== 'object' || value === null) return false;
  const monitor = value as Record<string, unknown>;
  return typeof monitor.persona === 'string'
    && Array.isArray(monitor.targets)
    && monitor.targets.every((target) => typeof target === 'string');
}

// Profile-level monitors live in a reserved `_monitors.json` file — a JSON array of
// `{ persona, targets }` — kept out of the entry set by the leading underscore (it is not an
// agent or harness tab). Returns [] when the file is absent, unparseable, or not an array;
// malformed elements are dropped.
export function loadProfileMonitors(profileDir: string): ProfileMonitor[] {
  const file = path.join(profileDir, '_monitors.json');
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(isProfileMonitor) : [];
  } catch {
    return [];
  }
}

function isProfileFilesEntry(value: unknown): value is ProfileFilesEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (entry.dock === undefined || (typeof entry.dock === 'string' && ['left', 'right'].includes(entry.dock)))
    && (entry.in === undefined || typeof entry.in === 'string')
    && (entry.path === undefined || typeof entry.path === 'string');
}

// Profile-level file-tree tabs live in a reserved `_files.json` file — a JSON array of
// `{ dock?, in? }` — kept out of the entry set by the leading underscore. Returns [] when the file
// is absent, unparseable, or not an array; malformed elements are dropped.
export function loadProfileFiles(profileDir: string): ProfileFilesEntry[] {
  const file = path.join(profileDir, '_files.json');
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(isProfileFilesEntry) : [];
  } catch {
    return [];
  }
}

function isDockEntry(value: unknown): value is { dock?: 'left' | 'right' } {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return entry.dock === undefined || (typeof entry.dock === 'string' && ['left', 'right'].includes(entry.dock));
}

function loadDockEntries<T>(profileDir: string, fileName: string, isEntry: (value: unknown) => value is T): T[] {
  const file = path.join(profileDir, fileName);
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

// Profile-level notifications tabs live in a reserved `_notifications.json` file — a JSON array of
// `{ dock? }` — kept out of the entry set by the leading underscore. Returns [] when the file is
// absent, unparseable, or not an array; malformed elements are dropped.
export function loadProfileNotifications(profileDir: string): ProfileNotificationsEntry[] {
  return loadDockEntries<ProfileNotificationsEntry>(profileDir, '_notifications.json', isDockEntry);
}

// Profile-level schedules tabs live in a reserved `_schedules.json` file — a JSON array of
// `{ dock? }` — kept out of the entry set by the leading underscore. Returns [] when the file is
// absent, unparseable, or not an array; malformed elements are dropped.
export function loadProfileSchedules(profileDir: string): ProfileSchedulesEntry[] {
  return loadDockEntries<ProfileSchedulesEntry>(profileDir, '_schedules.json', isDockEntry);
}

function isProfileWindow(value: unknown): value is { width: number; height: number } {
  if (typeof value !== 'object' || value === null) return false;
  const window = value as Record<string, unknown>;
  return typeof window.width === 'number' && typeof window.height === 'number';
}

// Profile-level layout sizing lives in a reserved `_layout.json` file — a single JSON object
// nested under a `layout` key (unlike the other reserved files, which are arrays) — kept out of
// the entry set by the leading underscore. Returns null when the file is absent, unparseable, not
// an object, or missing/malformed `layout`; individually malformed sub-fields are dropped while
// valid sibling fields are kept.
export function loadProfileLayout(profileDir: string): ProfileLayout | null {
  const file = path.join(profileDir, '_layout.json');
  if (!existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const layout = (parsed as Record<string, unknown>).layout;
    if (typeof layout !== 'object' || layout === null) return null;
    const fields = layout as Record<string, unknown>;
    const result: ProfileLayout = {};
    if (isProfileWindow(fields.window)) result.window = fields.window;
    if (typeof fields.sidebarLeft === 'number') result.sidebarLeft = fields.sidebarLeft;
    if (typeof fields.sidebarRight === 'number') result.sidebarRight = fields.sidebarRight;
    if (typeof fields.tabAreaPct === 'number') result.tabAreaPct = fields.tabAreaPct;
    return result;
  } catch {
    return null;
  }
}
