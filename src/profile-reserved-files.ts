import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ProfileFilesEntry, ProfileMonitor, ProfileNotificationsEntry } from './types.js';

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
    && (entry.in === undefined || typeof entry.in === 'string');
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

function isProfileNotificationsEntry(value: unknown): value is ProfileNotificationsEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return entry.dock === undefined || (typeof entry.dock === 'string' && ['left', 'right'].includes(entry.dock));
}

// Profile-level notifications tabs live in a reserved `_notifications.json` file — a JSON array of
// `{ dock? }` — kept out of the entry set by the leading underscore. Returns [] when the file is
// absent, unparseable, or not an array; malformed elements are dropped.
export function loadProfileNotifications(profileDir: string): ProfileNotificationsEntry[] {
  const file = path.join(profileDir, '_notifications.json');
  if (!existsSync(file)) return [];
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter(isProfileNotificationsEntry) : [];
  } catch {
    return [];
  }
}
