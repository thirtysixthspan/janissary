import type { ScheduleEntry } from '../types.js';

export type SystemScheduleEntry = ScheduleEntry & { key: string; script: string };

export type SystemScheduleSnapshot = { version: 1; entries: SystemScheduleEntry[] };

export type StoreLoadResult =
  | { ok: true; snapshot: SystemScheduleSnapshot }
  | { ok: false; kind: 'invalid'; error: Error }
  | { ok: false; kind: 'unsupported-version'; version: number };

export type StoreSaveResult =
  | { ok: true }
  | { ok: false; kind: 'invalid'; error: Error }
  | { ok: false; kind: 'unsupported-version'; version: number }
  | { ok: false; kind: 'io'; error: Error };
