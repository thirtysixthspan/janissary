import { describe, it, expect, vi } from 'vitest';
import { createController } from '../controller.js';
import { createControllerAdapters } from './create-adapters.js';
import { createTabControllerAdapter } from './tab-adapter.js';
import { createMonitorControllerAdapter } from './monitor-adapter.js';
import { createEditorControllerAdapter } from './editor-adapter.js';
import { createFileNavigatorControllerAdapter } from './file-navigator-adapter.js';
import { createPluginControllerAdapter } from './plugin-adapter.js';

// The external-open path shells out to the OS image viewer; stub it so tests never launch an app.
vi.mock('../openers/os-open.js', () => ({ didOsOpen: () => true }));
// Mock spawnPty so tab creation never spawns real processes.
vi.mock('../pty.js');

const makeManagers = () =>
  createController({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} }).managers;

describe('createControllerAdapters', () => {
  it('contributes every member of all five adapter factories', () => {
    const managers = makeManagers();
    const record = createControllerAdapters(managers) as unknown as Record<string, unknown>;
    const expected = [
      createTabControllerAdapter,
      createMonitorControllerAdapter,
      createEditorControllerAdapter,
      createFileNavigatorControllerAdapter,
      createPluginControllerAdapter,
    ].flatMap((create) => Object.keys(create(managers)));

    expect(expected.length).toBeGreaterThan(0);
    expect(expected.filter((name) => typeof record[name] !== 'function')).toEqual([]);
  });

  it('adds no members beyond what the five factories supply', () => {
    const managers = makeManagers();
    const record = createControllerAdapters(managers);
    const expected = new Set([
      createTabControllerAdapter,
      createMonitorControllerAdapter,
      createEditorControllerAdapter,
      createFileNavigatorControllerAdapter,
      createPluginControllerAdapter,
    ].flatMap((create) => Object.keys(create(managers))));

    expect(Object.keys(record).filter((name) => !expected.has(name))).toEqual([]);
  });

  it('delegates the tab surface to the tab manager', () => {
    const managers = makeManagers();
    const setActiveTab = vi.spyOn(managers.tab, 'setActiveTab');

    createControllerAdapters(managers).setActiveTab(0);

    expect(setActiveTab).toHaveBeenCalledWith(0);
  });

  it('delegates the monitor surface to the monitor manager', () => {
    const managers = makeManagers();
    const rate = vi.spyOn(managers.monitor, 'rate');

    createControllerAdapters(managers).rateSuggestion('sug-1', true);

    expect(rate).toHaveBeenCalledWith('sug-1', true);
  });

  it('delegates the file-navigator surface to the tab manager', () => {
    const managers = makeManagers();
    const setDock = vi.spyOn(managers.tab, 'setDock');

    createControllerAdapters(managers).setDock(0, 'left');

    expect(setDock).toHaveBeenCalledWith(0, 'left');
  });

  it('delegates the plugin surface to the plugin host', () => {
    const managers = makeManagers();
    const clientFailed = vi.spyOn(managers.plugins, 'clientFailed').mockImplementation(() => {});

    createControllerAdapters(managers).pluginFailed('image-1', 'boom');

    expect(clientFailed).toHaveBeenCalledWith('image-1', 'boom');
  });

  it('delegates the editor surface without touching a manager it does not own', () => {
    const managers = makeManagers();

    expect(createControllerAdapters(managers).projectFilesFallback())
      .toEqual({ root: managers.tab.launchDir, paths: [] });
  });
});
