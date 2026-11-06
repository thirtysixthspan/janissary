import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import * as notifications from '../notifications/index.js';
import type { Tab } from '../tab/types.js';
import {
  BUNDLED_MODEL_CATALOG, encodeModelCatalog, type ModelCatalog,
} from './catalog-file.js';
import { ModelCatalogManager, type ModelCatalogManagerOptions } from './manager.js';
import type { ProviderOutcome, ProviderRecord } from './providers/result.js';

let projectDir: string;
let report: ReturnType<typeof vi.spyOn>;

function seed(catalog: ModelCatalog): string {
  const overridePath = path.join(projectDir, '.janissary', 'known-models.json');
  mkdirSync(path.dirname(overridePath), { recursive: true });
  writeFileSync(overridePath, encodeModelCatalog(catalog));
  return overridePath;
}

function fixture(options: Omit<ModelCatalogManagerOptions, 'projectDir'> = {}) {
  const tabs: Tab[] = [];
  const managers = { tab: { tabs } } as unknown as Managers;
  const manager = new ModelCatalogManager(managers, { ...options, projectDir });
  return { manager, managers, tabs };
}

function outcome(records: ProviderRecord[]): ProviderOutcome {
  return { status: 'ok', records };
}

function skipped(reason = 'not installed'): ProviderOutcome {
  return { status: 'skipped', reason };
}

function providers(
  claude: ProviderOutcome = skipped(),
  codex: ProviderOutcome = skipped(),
  opencode: ProviderOutcome = skipped(),
) {
  return {
    claude: async () => claude,
    codex: async () => codex,
    opencode: async () => opencode,
  };
}

function watchChanges() {
  const changes = { models: 0, conversations: 0, state: 0 };
  const subscriptions = [
    messageBus.on('models', 'changed', () => { changes.models += 1; }),
    messageBus.on('conversations', 'changed', () => { changes.conversations += 1; }),
    messageBus.on('state', 'dirty', () => { changes.state += 1; }),
  ];
  return {
    changes,
    stop: () => {
      for (const subscription of subscriptions) subscription.unsubscribe();
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  // Promise.withResolvers is not available in the configured TypeScript library target.
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'model-manager-'));
  report = vi.spyOn(notifications, 'notify').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(projectDir, { recursive: true, force: true });
});

describe('ModelCatalogManager catalog behavior', () => {
  it('seeds a missing override from the bundled catalog when deleting', async () => {
    const { manager } = fixture();
    const id = BUNDLED_MODEL_CATALOG.claude?.[0]?.id;
    expect(id).toBeDefined();

    expect(await manager.delete('claude', id!)).toBeUndefined();

    const overridePath = path.join(projectDir, '.janissary', 'known-models.json');
    expect(existsSync(overridePath)).toBe(true);
    const saved = JSON.parse(readFileSync(overridePath, 'utf8'));
    expect(saved.claude[0]).toMatchObject({ id, disabled: true, hidden: true });
    expect(Object.keys(saved)).toEqual(Object.keys(BUNDLED_MODEL_CATALOG));
  });

  it('replaces a broken override from the bundled catalog when deleting', async () => {
    const overridePath = path.join(projectDir, '.janissary', 'known-models.json');
    mkdirSync(path.dirname(overridePath), { recursive: true });
    writeFileSync(overridePath, 'not-json');
    const { manager } = fixture();
    const id = BUNDLED_MODEL_CATALOG.codex?.[0]?.id;

    await manager.delete('codex', id!);

    expect(JSON.parse(readFileSync(overridePath, 'utf8')).codex[0])
      .toMatchObject({ id, disabled: true, hidden: true });
  });

  it('refuses unknown, hidden, and disabled deletes without writing', async () => {
    seed({ claude: [
      { id: 'visible' }, { id: 'hidden', hidden: true }, { id: 'disabled', disabled: true },
    ] });
    const write = vi.fn();
    const { manager } = fixture({ writeCatalog: write });

    expect(await manager.delete('claude', 'unknown')).toBe('no model "claude unknown"');
    expect(await manager.delete('claude', 'hidden')).toBe('no model "claude hidden"');
    expect(await manager.delete('claude', 'disabled')).toBe('no model "claude disabled"');
    expect(write).not.toHaveBeenCalled();
  });

  it('reloads hand edits and emits catalog changes only when the value changes', () => {
    const overridePath = seed({ claude: [{ id: 'old' }] });
    const watch = watchChanges();
    const { manager } = fixture();
    try {
      expect(watch.changes).toEqual({ models: 0, conversations: 0, state: 0 });
      writeFileSync(overridePath, encodeModelCatalog({ claude: [{ id: 'new' }] }));
      manager.reload();
      expect(manager.modelsFor('claude')).toEqual(['new']);
      expect(watch.changes).toEqual({ models: 1, conversations: 1, state: 1 });

      manager.reload();
      expect(watch.changes).toEqual({ models: 1, conversations: 1, state: 1 });
    } finally {
      watch.stop();
    }
  });

  it('publishes all catalog change signals after a successful Delete', async () => {
    seed({ claude: [{ id: 'hide-me' }] });
    const watch = watchChanges();
    const { manager } = fixture();
    try {
      await manager.delete('claude', 'hide-me');

      expect(watch.changes).toEqual({ models: 1, conversations: 1, state: 1 });
    } finally {
      watch.stop();
    }
  });

  it('excludes disabled models from lookups while hidden enabled models stay launchable', () => {
    seed({ claude: [
      { id: 'enabled-hidden', hidden: true }, { id: 'disabled', disabled: true },
    ] });
    const { manager } = fixture();

    expect(manager.modelsFor('claude')).toEqual(['enabled-hidden']);
    expect(manager.isKnownModel('claude', 'enabled-hidden')).toBe(true);
    expect(manager.isKnownModel('claude', 'disabled')).toBe(false);
    expect(manager.view().groups).toEqual([{
      key: 'claude', heading: 'Anthropic', records: [{ id: 'disabled', name: 'disabled', disabled: true }],
    }]);
  });
});

describe('ModelCatalogManager refresh behavior', () => {
  it('shares one in-flight refresh promise and provider run', async () => {
    const gate = deferred<ProviderOutcome>();
    const codex = vi.fn(() => gate.promise);
    const { manager } = fixture({ providers: { codex } });
    const first = manager.refresh();
    const second = manager.refresh();

    expect(second).toBe(first);
    expect(codex).toHaveBeenCalledOnce();
    expect(manager.view().refreshing).toBe(true);
    gate.resolve(outcome([{ id: 'new' }]));
    await first;
    expect(manager.view().refreshing).toBe(false);
  });

  it('applies a Delete during provider fetching before merging the provider result', async () => {
    seed({ codex: [{ id: 'kept' }] });
    const gate = deferred<ProviderOutcome>();
    const { manager } = fixture({ providers: { codex: () => gate.promise } });
    const refresh = manager.refresh();

    expect(await manager.delete('codex', 'kept')).toBeUndefined();
    gate.resolve(outcome([{ id: 'kept', name: 'Updated name' }]));
    await refresh;

    const saved = JSON.parse(readFileSync(path.join(projectDir, '.janissary', 'known-models.json'), 'utf8'));
    expect(saved.codex).toEqual([{ id: 'kept', name: 'Updated name', disabled: true, hidden: true }]);
  });

  it('does not write when no provider was reached and reports the not-refreshed summary', async () => {
    const write = vi.fn();
    const { manager, managers } = fixture({ providers: providers(), writeCatalog: write });

    await manager.refresh();

    expect(write).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledWith(
      managers, 'models-refresh', 'models', expect.stringContaining('Models not refreshed:'),
    );
  });

  it('attributes a refresh notice to the open models tab label', async () => {
    const { manager, managers, tabs } = fixture({ providers: providers() });
    tabs.push({
      label: 'models-2',
      plugin: { id: 'models', instanceKey: 'models', schemaVersion: 1, payload: {}, fileRefs: [], sourceLabel: 'models' },
    } as Tab);

    await manager.refresh();

    expect(report).toHaveBeenCalledWith(
      managers, 'models-refresh', 'models-2', expect.stringContaining('Models not refreshed:'),
    );
  });

  it('reports the provider summary and publishes a changed catalog after a successful write', async () => {
    seed({ claude: [{ id: 'old' }] });
    const watch = watchChanges();
    const { manager, managers } = fixture({ providers: providers(outcome([{ id: 'new' }])) });
    try {
      await manager.refresh();

      expect(manager.modelsFor('claude')).toEqual(['new']);
      expect(report).toHaveBeenCalledWith(
        managers, 'models-refresh', 'models',
        'Models refreshed: claude 1 (+1 −1). codex skipped: not installed. opencode skipped: not installed.',
      );
      expect(watch.changes).toEqual({ models: 4, conversations: 1, state: 1 });
    } finally {
      watch.stop();
    }
  });

  it('preserves the reloaded catalog on a write failure and reports the exact error', async () => {
    const overridePath = seed({ claude: [{ id: 'old' }] });
    const before = readFileSync(overridePath, 'utf8');
    const write = vi.fn(() => { throw new Error('read-only'); });
    const { manager, managers } = fixture({
      providers: providers(outcome([{ id: 'new' }])), writeCatalog: write,
    });

    await manager.refresh();

    expect(manager.modelsFor('claude')).toEqual(['old']);
    expect(readFileSync(overridePath, 'utf8')).toBe(before);
    expect(report).toHaveBeenCalledWith(
      managers, 'models-refresh', 'models', `Could not write known-models.json at ${overridePath}.`,
    );
  });

  it('does not write or report when disposed during a deferred refresh', async () => {
    const gate = deferred<ProviderOutcome>();
    const write = vi.fn();
    const { manager } = fixture({ providers: { codex: () => gate.promise }, writeCatalog: write });
    const refresh = manager.refresh();
    manager.dispose();
    gate.resolve(outcome([{ id: 'new' }]));
    await refresh;

    expect(write).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(manager.view().refreshing).toBe(false);
  });
});
