import { messageBus } from '../../bus.js';
import { errorText } from '../../error-text.js';
import type { Managers } from '../../managers.js';
import { SystemScheduleStore } from './store.js';
import { recoverSystemSchedules } from './boot-recovery.js';
import { appendSystemBatch, fireSystemBatch } from './firing.js';
import { notifySystemScheduleMissedRun, notifySystemScheduleMissingScript } from './notices.js';
import { cancelSystemScheduleByKey, cancelSystemScheduleByName, createSystemSchedule } from './mutations.js';
import type { SystemScheduleInput } from './mutations.js';
import type { SystemScheduleEntry, SystemScheduleSnapshot } from './types.js';

export type SystemScheduleResult = { ok: true; entry?: SystemScheduleEntry } | { ok: false; error: string };

export class SystemScheduleManager {
  private readonly store: SystemScheduleStore;
  private entries: SystemScheduleEntry[] = [];
  private disposed = false;
  private inFlight: Promise<void> = Promise.resolve();
  private activeTicks = 0;
  private bootSaveFailed = false;

  constructor(private readonly managers: Managers) {
    this.store = new SystemScheduleStore(managers.tab.launchDir);
  }

  load(cutoff = Date.now()): void {
    if (this.disposed) return;
    const loaded = this.store.load();
    if (!loaded.ok) {
      process.stderr.write(`System schedules could not load: ${loadError(loaded)}\n`);
      return;
    }
    const recovery = recoverSystemSchedules(loaded.snapshot.entries, cutoff);
    if (recovery.missed.length > 0) {
      const saved = this.save(recovery.entries);
      if (!saved) {
        this.entries = loaded.snapshot.entries;
        this.bootSaveFailed = true;
        return;
      }
      this.entries = recovery.entries;
      for (const entry of recovery.missed) {
        notifySystemScheduleMissedRun(this.managers, entry.id, entry.nextRun);
      }
      this.publish();
      return;
    }
    this.entries = loaded.snapshot.entries;
  }

  list(): SystemScheduleEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  add(input: SystemScheduleInput): SystemScheduleResult {
    const entry = createSystemSchedule(input);
    if (!this.commit([...this.entries, entry])) return { ok: false, error: 'could not save system schedule' };
    return { ok: true, entry };
  }

  cancelByName(name: string): SystemScheduleResult {
    const next = cancelSystemScheduleByName(this.entries, name);
    if (next.length === this.entries.length) return { ok: true };
    return this.commit(next) ? { ok: true } : { ok: false, error: 'could not save system schedules' };
  }

  cancelByKey(key: string): SystemScheduleResult {
    const next = cancelSystemScheduleByKey(this.entries, key);
    if (next.length === this.entries.length) return { ok: true };
    return this.commit(next) ? { ok: true } : { ok: false, error: 'could not save system schedules' };
  }

  clear(): SystemScheduleResult {
    if (this.entries.length === 0) return { ok: true };
    return this.commit([]) ? { ok: true } : { ok: false, error: 'could not save system schedules' };
  }

  tick(now: number): Promise<void> {
    if (this.disposed || this.bootSaveFailed) return Promise.resolve();
    this.inFlight = this.runAfter(this.inFlight, now);
    return this.inFlight;
  }

  dispose(): void | Promise<void> {
    this.disposed = true;
    if (this.activeTicks > 0) return this.inFlight;
  }

  private async fireDue(now: number): Promise<void> {
    for (const claimed of this.entries) {
      if (claimed.nextRun > now) continue;
      if (this.disposed) return;
      let outcome;
      try {
        outcome = await fireSystemBatch(this.managers, claimed, now);
      } catch (error) {
        process.stderr.write(`System schedule ${claimed.id}: ${errorText(error)}\n`);
        continue;
      }
      if (this.disposed || !outcome || this.entries.every((entry) => entry.key !== claimed.key)) continue;
      const current = this.entries.find((entry) => entry.key === claimed.key);
      if (!current) continue;
      const next = this.entries.filter((entry) => entry.key !== claimed.key);
      if (outcome.entry) next.push(outcome.entry);
      if (!this.commit(next)) continue;
      if (outcome.missing) notifySystemScheduleMissingScript(this.managers, current.id, current.script);
      else appendSystemBatch(this.managers, current, outcome.lines);
    }
  }

  private async runAfter(previous: Promise<void>, now: number): Promise<void> {
    this.activeTicks += 1;
    try {
      await previous;
      await this.fireDue(now);
    } finally {
      this.activeTicks -= 1;
    }
  }

  private commit(entries: SystemScheduleEntry[]): boolean {
    if (!this.save(entries)) return false;
    this.entries = entries;
    this.publish();
    return true;
  }

  private save(entries: SystemScheduleEntry[]): boolean {
    const result = this.store.save({ version: 1, entries } satisfies SystemScheduleSnapshot);
    if (result.ok) return true;
    process.stderr.write(`System schedules could not save: ${saveError(result)}\n`);
    return false;
  }

  private publish(): void {
    messageBus.emit('schedules', { type: 'changed' });
    messageBus.emit('state', { type: 'dirty' });
  }
}

function loadError(result: Exclude<ReturnType<SystemScheduleStore['load']>, { ok: true }>): string {
  return result.kind === 'unsupported-version' ? `unsupported version ${result.version}` : result.error.message;
}

function saveError(result: Exclude<ReturnType<SystemScheduleStore['save']>, { ok: true }>): string {
  return result.kind === 'unsupported-version' ? `unsupported version ${result.version}` : result.error.message;
}
