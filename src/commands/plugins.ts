import type { Command } from './types.js';
import type { TabPluginDeclaration } from '../plugins/api.js';
import type { TabPluginStatus } from '../plugins/host.js';

function statusLine(
  declaration: TabPluginDeclaration,
  status: TabPluginStatus,
): string {
  const fields = [
    declaration.id,
    declaration.version,
    `api=${declaration.apiVersion}`,
    `state=${status.state}`,
  ];
  if (status.activationMs !== undefined) fields.push(`activation=${status.activationMs}ms`);
  if (status.reason !== undefined) fields.push(`reason=${status.reason}`);
  return fields.join(' ');
}

export const command: Command = {
  name: 'plugins',
  match: (input) => /^plugins\b/iu.test(input),
  run: (input, tab, managers) => {
    const argument = input.replace(/^plugins\b\s*/iu, '').trim();
    if (argument) {
      managers.tab.append(tab.label, { input, output: 'Usage: plugins' });
      return;
    }
    // Read the host's own declaration list rather than importing the catalog, so the printed rows
    // can never disagree with the plugins the running host actually knows about.
    for (const declaration of managers.plugins.declarations) {
      const status = managers.plugins.statusFor(declaration.id) ?? { state: 'declared' };
      managers.tab.append(tab.label, { input, output: statusLine(declaration, status) });
    }
  },
};
