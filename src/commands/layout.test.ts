import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandManagers } from './types.js';
import { command } from './layout.js';
import { getClientLayout, setClientLayout } from '../client-layout.js';
import { messageBus } from '../bus.js';
import { setWindowBoundsReader, setWindowResizer } from '../window-resizer.js';

const notifications = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../notifications/index.js', () => ({ notify: notifications.notify }));

type Output = { label: string; input: string; output: string };

function fixture(hasSplit = false) {
  const appended: Output[] = [];
  const managers = {
    tab: {
      secondaryTabLabel: hasSplit ? 'right' : undefined,
      append: (label: string, entry: { input: string; output: string }) => { appended.push({ label, ...entry }); },
    },
  } as unknown as CommandManagers;
  const run = (input: string) => command.run(input, { label: 'janus', index: 0 }, managers);
  return { appended, managers, run };
}

beforeEach(() => {
  notifications.notify.mockClear();
  setWindowResizer(undefined);
  setWindowBoundsReader(undefined);
});

afterEach(() => {
  messageBus.clear();
  setWindowResizer(undefined);
  setWindowBoundsReader(undefined);
});

describe('layout command', () => {
  it('claims the complete command token case-insensitively', () => {
    expect(command.match('layout')).toBe(true);
    expect(command.match('LAYOUT show')).toBe(true);
    expect(command.match('layoutish')).toBe(false);
  });

  it('reports no layout when neither a window nor client layout is available', async () => {
    const { managers, run, appended } = fixture();

    await run('layout show');

    expect(appended).toEqual([]);
    expect(notifications.notify).toHaveBeenCalledWith(managers, 'layout', 'janus', 'No layout to show.');
    expect(getClientLayout()).toBeUndefined();
  });

  it('resizes an open window with the requested pixel dimensions and stays silent', async () => {
    const { run, appended } = fixture();
    const resize = vi.fn(async () => {});
    setWindowResizer(resize);

    await run('layout window 1440 900');

    expect(resize).toHaveBeenCalledWith(1440, 900);
    expect(appended).toEqual([]);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('does nothing silently when no window resizer is registered', async () => {
    const { run, appended } = fixture();

    await run('layout window 1440 900');

    expect(appended).toEqual([]);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('notifies with the first line when a window resize fails', async () => {
    const { managers, run, appended } = fixture();
    setWindowResizer(async () => { throw new Error('window is maximized.\nCDP details'); });

    await run('layout window 1440 900');

    expect(appended).toEqual([]);
    expect(notifications.notify).toHaveBeenCalledWith(
      managers, 'layout', 'janus', 'Could not resize the window: window is maximized.',
    );
  });

  it('emits only the requested sidebar width, including when the sidebar is hidden', async () => {
    const { run, appended } = fixture();
    const updates: unknown[] = [];
    messageBus.on('layout', 'update', (update) => { updates.push(update); });

    await run('layout sidebar LEFT 400');

    expect(updates).toEqual([{ type: 'update', sidebarLeft: 400 }]);
    expect(appended).toEqual([]);
  });

  it('reports when split sizing is requested without a visible split', async () => {
    const { run, appended } = fixture();
    const updates: unknown[] = [];
    messageBus.on('layout', 'update', (update) => { updates.push(update); });

    await run('layout split 60');

    expect(appended).toEqual([{ label: 'janus', input: 'layout split 60', output: 'No split is showing.' }]);
    expect(updates).toEqual([]);
  });

  it('emits only the split percent when a split is showing', async () => {
    const { run, appended } = fixture(true);
    const updates: unknown[] = [];
    messageBus.on('layout', 'update', (update) => { updates.push(update); });

    await run('layout split 60');

    expect(updates).toEqual([{ type: 'update', splitPct: 60 }]);
    expect(appended).toEqual([]);
  });

  it('sets the reporting share as the complement of the upper tab-area share', async () => {
    const { run, appended } = fixture();
    const updates: unknown[] = [];
    messageBus.on('layout', 'update', (update) => { updates.push(update); });

    await run('layout reporting 25');

    expect(updates).toEqual([{ type: 'update', tabAreaPct: 75 }]);
    expect(appended).toEqual([]);
  });

  it('accepts every set form silently when no client is connected', async () => {
    const { run, appended } = fixture(true);
    await run('layout sidebar right 300');
    await run('layout split 60');
    await run('layout reporting 25');

    expect(appended).toEqual([]);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('prints the current sizes in re-runnable order, rounded to whole numbers', async () => {
    const { run, appended } = fixture(true);
    setClientLayout({ sidebarLeft: 400.5, sidebarRight: 250.4, tabAreaPct: 74.5, splitPct: 62.5 });
    setWindowBoundsReader(async () => ({ width: 1440.5, height: 900.4 }));

    await run('layout show');

    expect(appended).toEqual([{
      label: 'janus', input: 'layout show', output: [
        'layout window 1441 900',
        'layout sidebar left 401',
        'layout sidebar right 250',
        'layout split 63',
        'layout reporting 26',
      ].join('\n'),
    }]);
  });

  it('omits the window line without a bounds reader and the split line without a split', async () => {
    const { run, appended } = fixture();
    setClientLayout({ sidebarLeft: 400, sidebarRight: 250, tabAreaPct: 75, splitPct: 60 });

    await run('layout show');

    expect(appended[0].output).toBe([
      'layout sidebar left 400',
      'layout sidebar right 250',
      'layout reporting 25',
    ].join('\n'));
  });

  it('notifies on a failed bounds read and still prints the other available sizes', async () => {
    const { managers, run, appended } = fixture(true);
    setClientLayout({ sidebarLeft: 400, sidebarRight: 250, tabAreaPct: 75, splitPct: 60 });
    setWindowBoundsReader(async () => { throw new Error('browser unavailable.\nCDP details'); });

    await run('layout show');

    expect(appended[0].output).toBe([
      'layout sidebar left 400', 'layout sidebar right 250', 'layout split 60', 'layout reporting 25',
    ].join('\n'));
    expect(notifications.notify).toHaveBeenCalledWith(
      managers, 'layout', 'janus', 'Could not read the window size: browser unavailable.',
    );
  });

  it('appends the exact usage line for malformed input', async () => {
    const { run, appended } = fixture();

    await run('layout sidebar center 300');

    expect(appended).toEqual([{
      label: 'janus', input: 'layout sidebar center 300',
      output: 'Usage: layout window <width> <height> | sidebar left|right <width> | split <percent> | reporting <percent> | show.',
    }]);
  });
});
