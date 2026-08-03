import { beforeEach, describe, expect, it } from 'vitest';
import { commands } from '../commands/index.js';
import { coreAvailableCommands } from '../commands.js';
import { openers } from '../openers/index.js';
import type { Command } from '../commands/types.js';
import type { Opener } from '../openers/types.js';
import type { TabPluginDeclaration } from './api.js';
import { TAB_PLUGIN_API_VERSION } from './api.js';
import { createPluginCommands } from './command-adapter.js';
import { createPluginOpeners, pluginContentTypes } from './opener-adapter.js';
import { clearContributionRejections, contributionRejection } from './rejections.js';

// The rejection ledger is a module singleton the production registries populate at import time, so
// each case starts from a clean one rather than reading a neighbour's conflict.
beforeEach(() => { clearContributionRejections(); });

function manifest(id: string, overrides: Partial<TabPluginDeclaration> = {}): TabPluginDeclaration {
  return {
    id, version: '1.0.0', apiVersion: TAB_PLUGIN_API_VERSION, payloadSchemaVersion: 1,
    tabLabelPrefix: id, fileExtensions: { [`.${id}`]: 'text/plain' }, capabilities: [],
    ...overrides,
  };
}

describe('tab plugin opener adapter', () => {
  const core: Opener = {
    name: 'core', extensions: ['.core'], inline: () => {}, external: () => {},
  };

  it('normalizes claims, preserves edit gestures, and keeps production plugins after core', () => {
    const [opener] = createPluginOpeners([
      manifest('fixture', { fileExtensions: { '.FIXTURE': 'text/plain' }, editGesture: 'open external' }),
    ], [core]);
    expect(opener).toMatchObject({
      name: 'fixture', extensions: ['.fixture'], editGesture: 'open external',
    });
    expect(openers.findIndex((item) => item.name === 'video'))
      .toBeGreaterThan(openers.findIndex((item) => item.name === 'editor'));
  });

  it('drops a claim owned by core and records why, without throwing', () => {
    const built = createPluginOpeners([
      manifest('fixture', { fileExtensions: { '.CORE': undefined } }),
    ], [core]);
    expect(built).toEqual([]);
    expect(contributionRejection('fixture')).toBe('duplicate tab plugin extension claim ".core"');
  });

  it('keeps the first plugin to claim an extension and drops the second', () => {
    const built = createPluginOpeners([
      manifest('first', { fileExtensions: { '.same': undefined } }),
      manifest('second', { fileExtensions: { '.SAME': undefined } }),
    ], []);
    expect(built.map((opener) => opener.name)).toEqual(['first']);
    expect(contributionRejection('first')).toBeUndefined();
    expect(contributionRejection('second')).toBe('duplicate tab plugin extension claim ".same"');
  });
});

describe('tab plugin content types', () => {
  const core: Opener = {
    name: 'image', extensions: ['.png'], inline: () => {}, external: () => {},
  };

  it('serves the content types of accepted claims, lowercased', () => {
    const declarations = [manifest('fixture', {
      fileExtensions: { '.FIXTURE': 'text/plain', '.external-only': undefined },
    })];
    expect(pluginContentTypes(declarations, createPluginOpeners(declarations, [])))
      .toEqual({ '.fixture': 'text/plain' });
  });

  it('gives a rejected claim no content type, so it cannot overwrite core', () => {
    const declarations = [manifest('impostor', { fileExtensions: { '.png': 'image/bogus' } })];
    const accepted = createPluginOpeners(declarations, [core]);

    expect(accepted).toEqual([]);
    expect(pluginContentTypes(declarations, accepted)).toEqual({});
  });

  it('hands the content type to whichever duplicate claimant won the opener', () => {
    const declarations = [
      manifest('first', { fileExtensions: { '.same': 'type/first' } }),
      manifest('second', { fileExtensions: { '.same': 'type/second' } }),
    ];
    const accepted = createPluginOpeners(declarations, []);

    expect(accepted.map((opener) => opener.name)).toEqual(['first']);
    expect(pluginContentTypes(declarations, accepted)).toEqual({ '.same': 'type/first' });
  });

  // Composition walks accepted openers, and core's are accepted openers too. Only entries that trace
  // back to a declaration may name a content type, so passing the whole registry cannot let a plugin
  // table quietly claim `.png` on core's behalf.
  it('ignores an accepted opener that no declaration owns', () => {
    const declarations = [manifest('fixture', { fileExtensions: { '.fixture': 'text/plain' } })];
    const accepted = [core, ...createPluginOpeners(declarations, [core])];
    expect(pluginContentTypes(declarations, accepted)).toEqual({ '.fixture': 'text/plain' });
  });
});

describe('tab plugin command adapter', () => {
  it('refuses every production reserved name without contributing a command', () => {
    const reserved = new Set([
      ...coreAvailableCommands,
      ...commands.map((command) => command.name),
      'schedule', 'harness', 'ssh', 'shell',
    ]);
    for (const name of reserved) {
      clearContributionRejections();
      expect(createPluginCommands([manifest('fixture', { command: name })], commands)).toEqual([]);
      expect(contributionRejection('fixture'))
        .toBe(`reserved tab plugin command claim "${name.toLowerCase()}"`);
    }
  });

  it('keeps the first plugin to claim a command name and drops the second', () => {
    const built = createPluginCommands([
      manifest('first', { command: 'fixture' }),
      manifest('second', { command: 'FIXTURE' }),
    ], []);
    expect(built.map((command) => command.name)).toEqual(['fixture']);
    expect(contributionRejection('second')).toBe('duplicate tab plugin command claim "fixture"');
  });

  it('matches a case-insensitive first token on a word boundary', () => {
    const core: Command[] = [];
    const [command] = createPluginCommands([manifest('fixture', { command: 'fixture' })], core);
    expect(command.match('FIXTURE path')).toBe(true);
    expect(command.match('fixture-extra path')).toBe(false);
  });

  it('does not register the frozen fixture in production', () => {
    expect(commands.map((command) => command.name)).not.toContain('fixture-v1');
  });

  // `command` is optional. A plugin that only claims extensions contributes an opener and nothing
  // else, and must not reserve a name or land an unrunnable entry in the command registry.
  it('contributes no command for a declaration that claims none', () => {
    const built = createPluginCommands([
      manifest('opener-only'),
      manifest('with-command', { command: 'fixture' }),
    ], []);
    expect(built.map((command) => command.name)).toEqual(['fixture']);
    expect(contributionRejection('opener-only')).toBeUndefined();
  });
});

describe('rejection ledger', () => {
  // The first conflict is the one a reader would hit and fix, so a plugin refused twice keeps
  // reporting that one instead of whichever registry happened to be built last.
  it('keeps the first reason recorded for a plugin', () => {
    createPluginOpeners([manifest('both', { fileExtensions: { '.core': 'text/plain' } })], [{
      name: 'core', extensions: ['.core'], inline: () => {}, external: () => {},
    }]);
    createPluginCommands([manifest('both', { command: 'help' })], []);
    expect(contributionRejection('both')).toBe('duplicate tab plugin extension claim ".core"');
  });
});
