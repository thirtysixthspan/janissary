import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createController } from '../../controller.js';
import { messageBus } from '../../bus.js';
import { makeTab } from '../../tab/index.js';
import { SystemScheduleStore } from './store.js';

const sinks = { emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} };
const schedule = (id: string, key: string) => ({
  id, key, command: 'script build', script: 'build', spec: 'at 9am', nextRun: Date.now() + 60_000, recurring: false,
});

describe('SystemScheduleManager mutations', () => {
  it('persists distinct keys for repeated names and cancels all name matches or one key', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'system-schedule-owner-'));
    const controller = createController(sinks, root);
    const owner = controller.managers.systemSchedule;
    const first = owner.add(schedule('same', 'ignored')).entry!;
    const second = owner.add(schedule('same', 'ignored')).entry!;
    expect(first.key).not.toBe(second.key);
    expect(owner.cancelByKey(first.key).ok).toBe(true);
    expect(owner.list().map((entry) => entry.key)).toEqual([second.key]);
    expect(owner.cancelByName('same').ok).toBe(true);
    expect(owner.list()).toEqual([]);
    expect(new SystemScheduleStore(root).load()).toEqual({ ok: true, snapshot: { version: 1, entries: [] } });
    void controller.shutdown();
  });

  it('leaves memory and emits nothing when the atomic save cannot write', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'system-schedule-failure-'));
    writeFileSync(path.join(root, '.janissary'), 'not a directory');
    const controller = createController(sinks, root);
    const changed = vi.fn();
    const unsubscribe = messageBus.on('schedules', 'changed', changed);
    expect(controller.managers.systemSchedule.add(schedule('one', 'ignored')).ok).toBe(false);
    expect(controller.managers.systemSchedule.list()).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
    unsubscribe.unsubscribe();
    void controller.shutdown();
  });

  it('saves a due firing before appending its contiguous script batch', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'system-schedule-fire-'));
    mkdirSync(path.join(root, '.janissary', 'scripts'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'scripts', 'build.rs'), 'first\nsecond\n');
    const controller = createController(sinks, root);
    const system = { ...makeTab('system'), systemShell: true, runtime: { busy: false, context: [], queue: [] } };
    controller.managers.tab.tabs.push(system);
    vi.spyOn(controller.managers.systemShell, 'ensure').mockResolvedValue({ status: 'ok', tab: system });
    const due = { ...schedule('build-now', 'key'), nextRun: 0 };
    const added = controller.managers.systemSchedule.add(due);
    expect(added.ok).toBe(true);

    await controller.managers.systemSchedule.tick(1);

    expect(controller.managers.systemSchedule.list()).toEqual([]);
    expect(system.runtime?.queue).toEqual([
      { line: 'first', origin: { kind: 'system-schedule', scheduleKey: added.ok ? added.entry!.key : '' } },
      { line: 'second', origin: { kind: 'system-schedule', scheduleKey: added.ok ? added.entry!.key : '' } },
    ]);
    expect(new SystemScheduleStore(root).load()).toEqual({ ok: true, snapshot: { version: 1, entries: [] } });
    await controller.shutdown();
  });
});
