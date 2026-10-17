import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createController } from '../../controller.js';
import { messageBus } from '../../bus.js';
import { makeTab } from '../../tab/index.js';
import { SystemScheduleStore } from './store.js';
import * as firing from './firing.js';
import { notifySystemShellStartFailure } from './notices.js';

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

  it('fires same-named due entries independently by key and persists each outcome', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'system-schedule-duplicate-name-fire-'));
    const scripts = path.join(root, '.janissary', 'scripts');
    mkdirSync(scripts, { recursive: true });
    writeFileSync(path.join(scripts, 'recurring.rs'), 'recurring first\nrecurring second\n');
    writeFileSync(path.join(scripts, 'one-shot.rs'), 'one-shot first\none-shot second\n');
    const controller = createController(sinks, root);
    const system = { ...makeTab('system'), systemShell: true, runtime: { busy: false, context: [], queue: [] } };
    controller.managers.tab.tabs.push(system);
    vi.spyOn(controller.managers.systemShell, 'ensure').mockResolvedValue({ status: 'ok', tab: system });
    const recurring = controller.managers.systemSchedule.add({
      ...schedule('same', 'ignored'), script: 'recurring', command: 'script recurring', nextRun: 0,
      recurring: true, intervalMs: 60_000,
    });
    const oneShot = controller.managers.systemSchedule.add({
      ...schedule('same', 'ignored'), script: 'one-shot', command: 'script one-shot', nextRun: 0,
    });
    if (!recurring.ok || !recurring.entry || !oneShot.ok || !oneShot.entry) {
      throw new Error('same-named schedules were not added');
    }
    expect(recurring.entry.key).not.toBe(oneShot.entry.key);

    await controller.managers.systemSchedule.tick(1);

    expect(system.runtime?.queue).toEqual([
      { line: 'recurring first', origin: { kind: 'system-schedule', scheduleKey: recurring.entry.key } },
      { line: 'recurring second', origin: { kind: 'system-schedule', scheduleKey: recurring.entry.key } },
      { line: 'one-shot first', origin: { kind: 'system-schedule', scheduleKey: oneShot.entry.key } },
      { line: 'one-shot second', origin: { kind: 'system-schedule', scheduleKey: oneShot.entry.key } },
    ]);
    const persisted = { ...recurring.entry, nextRun: 60_001 };
    expect(controller.managers.systemSchedule.list()).toEqual([persisted]);
    expect(new SystemScheduleStore(root).load()).toEqual({ ok: true, snapshot: { version: 1, entries: [persisted] } });
    await controller.shutdown();
  });

  it('keeps due entries and the persisted snapshot when boot recovery cannot save', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'system-schedule-boot-save-'));
    const store = new SystemScheduleStore(root);
    const due = { ...schedule('missed', 'due-key'), nextRun: 0 };
    expect(store.save({ version: 1, entries: [due] }).ok).toBe(true);
    const controller = createController(sinks, root);
    const toast = vi.fn();
    const subscription = messageBus.on('notifications', 'toast', toast);
    vi.spyOn(SystemScheduleStore.prototype, 'save').mockReturnValue({ ok: false, kind: 'io', error: new Error('disk full') });

    controller.managers.systemSchedule.load(1);
    await controller.managers.systemSchedule.tick(2);

    expect(controller.managers.systemSchedule.list()).toEqual([due]);
    expect(store.load()).toEqual({ ok: true, snapshot: { version: 1, entries: [due] } });
    expect(toast).not.toHaveBeenCalled();
    subscription.unsubscribe();
    vi.restoreAllMocks();
    await controller.shutdown();
  });

  it.each([
    ['invalid data', { version: 1, entries: [{ key: 'bad' }] }],
    ['unsupported version', { version: 2, entries: [] }],
  ])('ignores %s without rewriting it or accepting new schedules', (_label, snapshot) => {
    const root = mkdtempSync(path.join(tmpdir(), 'system-schedule-load-error-'));
    const directory = path.join(root, '.janissary');
    mkdirSync(directory);
    const file = path.join(directory, 'system-schedules.json');
    writeFileSync(file, JSON.stringify(snapshot));
    const controller = createController(sinks, root);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const original = readFileSync(file, 'utf8');

    controller.managers.systemSchedule.load(1);

    expect(controller.managers.systemSchedule.list()).toEqual([]);
    expect(readFileSync(file, 'utf8')).toBe(original);
    if (snapshot.version === 2) {
      expect(controller.managers.systemSchedule.add(schedule('new', 'ignored')).ok).toBe(false);
      expect(readFileSync(file, 'utf8')).toBe(original);
      expect(stderr).toHaveBeenCalledTimes(2);
    } else {
      expect(controller.managers.systemSchedule.add(schedule('new', 'ignored')).ok).toBe(true);
      expect(new SystemScheduleStore(root).load().ok).toBe(true);
      expect(stderr).toHaveBeenCalledOnce();
    }
    stderr.mockRestore();
    void controller.shutdown();
  });

  it('leaves unreadable scripts due and independently fires another due key', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'system-schedule-independent-'));
    const scripts = path.join(root, '.janissary', 'scripts');
    mkdirSync(scripts, { recursive: true });
    writeFileSync(path.join(scripts, 'good.rs'), 'run good\n');
    writeFileSync(path.join(scripts, 'source.rs'), 'must not run\n');
    symlinkSync(path.join(scripts, 'source.rs'), path.join(scripts, 'unsafe.rs'));
    const controller = createController(sinks, root);
    const system = { ...makeTab('system'), systemShell: true, runtime: { busy: false, context: [], queue: [] } };
    controller.managers.tab.tabs.push(system);
    vi.spyOn(controller.managers.systemShell, 'ensure').mockResolvedValue({ status: 'ok', tab: system });
    const unreadableInput = { ...schedule('unsafe', 'unused'), script: 'unsafe', command: 'script unsafe', nextRun: 0 };
    const readableInput = { ...schedule('good', 'unused'), script: 'good', command: 'script good', nextRun: 0 };
    const unreadable = controller.managers.systemSchedule.add(unreadableInput);
    const readable = controller.managers.systemSchedule.add(readableInput);
    const toast = vi.fn();
    const subscription = messageBus.on('notifications', 'toast', toast);

    await controller.managers.systemSchedule.tick(1);

    expect(unreadable.ok && readable.ok).toBe(true);
    const unreadableEntry = controller.managers.systemSchedule.list()[0];
    expect(controller.managers.systemSchedule.list()).toEqual([unreadableEntry]);
    expect(new SystemScheduleStore(root).load()).toEqual({ ok: true, snapshot: { version: 1, entries: [unreadableEntry] } });
    expect(system.runtime?.queue).toEqual([{ line: 'run good', origin: { kind: 'system-schedule', scheduleKey: readable.ok ? readable.entry!.key : '' } }]);
    expect(toast).toHaveBeenCalledOnce();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('System schedule good ran') }));
    subscription.unsubscribe();
    await controller.shutdown();
  });

  it('removes a missing one-shot only after saving and posts its notice', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'system-schedule-missing-'));
    const controller = createController(sinks, root);
    controller.managers.tab.tabs.push({
      ...makeTab('system'), systemShell: true, runtime: { busy: false, context: [], queue: [] },
    });
    const entry = controller.managers.systemSchedule.add({ ...schedule('missing', 'unused'), nextRun: 0 });
    if (!entry.ok || !entry.entry) throw new Error('schedule was not added');
    const toast = vi.fn();
    const snapshotsAtNotice: ReturnType<SystemScheduleStore['load']>[] = [];
    const subscription = messageBus.on('notifications', 'toast', (event) => {
      toast(event);
      snapshotsAtNotice.push(new SystemScheduleStore(root).load());
    });

    await controller.managers.systemSchedule.tick(1);

    expect(controller.managers.systemSchedule.list()).toEqual([]);
    expect(new SystemScheduleStore(root).load()).toEqual({ ok: true, snapshot: { version: 1, entries: [] } });
    expect(snapshotsAtNotice).toEqual([{ ok: true, snapshot: { version: 1, entries: [] } }]);
    expect(controller.managers.tab.byLabel('system')?.runtime?.queue).toEqual([]);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('System schedule missing could not run: script ".janissary/scripts/build.rs" is missing.'),
    }));
    subscription.unsubscribe();
    await controller.shutdown();
  });

  it('retries a due key after shell preparation fails and cancellation wins deferred preparation', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'system-schedule-retry-'));
    mkdirSync(path.join(root, '.janissary', 'scripts'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'scripts', 'build.rs'), 'first\n');
    const controller = createController(sinks, root);
    const system = { ...makeTab('system'), systemShell: true, runtime: { busy: false, context: [], queue: [] } };
    controller.managers.tab.tabs.push(system);
    const toast = vi.fn();
    const subscription = messageBus.on('notifications', 'toast', toast);
    const ensure = vi.spyOn(controller.managers.systemShell, 'ensure')
      .mockImplementationOnce(async () => {
        const reason = new Error('not ready');
        notifySystemShellStartFailure(controller.managers, reason);
        return { status: 'failed', reason };
      })
      .mockResolvedValue({ status: 'ok', tab: system });
    const added = controller.managers.systemSchedule.add({ ...schedule('build', 'unused'), nextRun: 0 });
    if (!added.ok || !added.entry) throw new Error('schedule was not added');
    const due = added.entry;

    await controller.managers.systemSchedule.tick(1);
    expect(controller.managers.systemSchedule.list()).toEqual([due]);
    expect(system.runtime?.queue).toEqual([]);
    expect(new SystemScheduleStore(root).load()).toEqual({ ok: true, snapshot: { version: 1, entries: [due] } });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ message: 'System shell could not start: not ready.' }));
    await controller.managers.systemSchedule.tick(2);
    expect(controller.managers.systemSchedule.list()).toEqual([]);
    expect(system.runtime?.queue).toEqual([{ line: 'first', origin: { kind: 'system-schedule', scheduleKey: due.key } }]);

    const gate = Promise.withResolvers<{ lines: string[]; entry: undefined; missing: false }>();
    vi.spyOn(firing, 'fireSystemBatch').mockReturnValueOnce(gate.promise);
    const secondResult = controller.managers.systemSchedule.add({ ...schedule('second', 'unused'), nextRun: 0 });
    if (!secondResult.ok || !secondResult.entry) throw new Error('schedule was not added');
    const second = secondResult.entry;
    const firingTick = controller.managers.systemSchedule.tick(3);
    await Promise.resolve();
    expect(controller.managers.systemSchedule.cancelByKey(second.key).ok).toBe(true);
    gate.resolve({ lines: ['stale'], entry: undefined, missing: false });
    await firingTick;
    expect(controller.managers.systemSchedule.list()).toEqual([]);
    expect(system.runtime?.queue).toHaveLength(1);
    expect(new SystemScheduleStore(root).load()).toEqual({ ok: true, snapshot: { version: 1, entries: [] } });
    expect(ensure).toHaveBeenCalledTimes(2);
    subscription.unsubscribe();
    vi.restoreAllMocks();
    await controller.shutdown();
  });

  it('does not enqueue after disposal during deferred shell preparation', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'system-schedule-dispose-'));
    mkdirSync(path.join(root, '.janissary', 'scripts'), { recursive: true });
    writeFileSync(path.join(root, '.janissary', 'scripts', 'build.rs'), 'stale\n');
    const controller = createController(sinks, root);
    const system = { ...makeTab('system'), systemShell: true, runtime: { busy: false, context: [], queue: [] } };
    controller.managers.tab.tabs.push(system);
    const gate = Promise.withResolvers<{ status: 'ok'; tab: typeof system }>();
    vi.spyOn(controller.managers.systemShell, 'ensure').mockReturnValue(gate.promise);
    const result = controller.managers.systemSchedule.add({ ...schedule('build', 'unused'), nextRun: 0 });
    if (!result.ok || !result.entry) throw new Error('schedule was not added');
    const due = result.entry;
    const ticking = controller.managers.systemSchedule.tick(1);
    await Promise.resolve();
    const disposing = controller.managers.systemSchedule.dispose();
    gate.resolve({ status: 'ok', tab: system });
    await Promise.all([ticking, disposing]);

    expect(system.runtime?.queue).toEqual([]);
    expect(controller.managers.systemSchedule.list()).toEqual([due]);
    expect(new SystemScheduleStore(root).load()).toEqual({ ok: true, snapshot: { version: 1, entries: [due] } });
    await controller.shutdown();
  });
});
