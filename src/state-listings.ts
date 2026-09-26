import { listTasks } from './tasks.js';
import { listProfileRows } from './profiles.js';
import type { TaskRow } from './tab/types.js';
import type { ProfileRow } from './profile/types.js';

// The task and profile listings ride on every state broadcast, which fires on essentially every
// mutation (each shell or ACP output chunk, each keystroke). Walking the disk each time put several
// synchronous `readdirSync` walks on the event loop that serves every tab, so a broadcast reuses a
// listing younger than this and a file added on disk shows up in its picker within that window.
export const LISTING_TTL_MS = 1000;

type Entry<T> = { key: string; at: number; value: T };

// A negative age means the wall clock stepped backwards; treating it as stale keeps a clock change
// from pinning an old listing in place.
function refresh<T>(entry: Entry<T> | undefined, key: string, now: number, compute: () => T): Entry<T> {
  if (entry?.key === key) {
    const age = now - entry.at;
    if (age >= 0 && age < LISTING_TTL_MS) return entry;
  }
  return { key, at: now, value: compute() };
}

let tasks: Entry<TaskRow[]> | undefined;
let profiles: Entry<ProfileRow[]> | undefined;

export function cachedTasks(projectDir: string, now: () => number = Date.now): TaskRow[] {
  tasks = refresh(tasks, projectDir, now(), () => listTasks(projectDir));
  return tasks.value;
}

export function cachedProfileRows(now: () => number = Date.now): ProfileRow[] {
  profiles = refresh(profiles, '', now(), () => listProfileRows());
  return profiles.value;
}
