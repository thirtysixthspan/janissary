import { describe, expect, it } from 'vitest';
import { commands } from '../../commands/index.js';
import { TAB_PLUGIN_API_VERSION } from '../api.js';
import { tabPluginCatalog } from '../catalog.js';
import { createPluginCommands } from '../command-adapter.js';
import { clearContributionRejections, contributionRejection } from '../rejections.js';
import { scriptsManifest } from './manifest.js';
import { SCRIPTS_PAYLOAD_SCHEMA_VERSION } from './shared.js';

function coreOnly() {
  return commands.filter((command) => !command.run.toString().includes('runCommand'));
}

describe('scripts tab plugin manifest', () => {
  it('is the entry the production catalog holds', () => {
    expect(tabPluginCatalog).toContain(scriptsManifest);
  });

  it('claims the scripts command and the runscripts topic, and never docks', () => {
    expect(scriptsManifest.id).toBe('scripts');
    expect(scriptsManifest.command).toBe('scripts');
    expect(scriptsManifest.notifications).toEqual(['runscripts']);
    expect(scriptsManifest.capabilities).not.toContain('dockTab');
  });

  it('pins the API and payload versions to their constants', () => {
    expect(scriptsManifest.apiVersion).toBe(TAB_PLUGIN_API_VERSION);
    expect(scriptsManifest.payloadSchemaVersion).toBe(SCRIPTS_PAYLOAD_SCHEMA_VERSION);
  });

  it('admits the command claim and routes scripts and scripts left to it', () => {
    clearContributionRejections();
    const named = createPluginCommands(tabPluginCatalog, coreOnly())
      .filter((command) => command.name === 'scripts');
    expect(named).toHaveLength(1);
    expect(contributionRejection('scripts')).toBeUndefined();
    expect(named[0].match('scripts')).toBe(true);
    expect(named[0].match('scripts left')).toBe(true);
  });
});
