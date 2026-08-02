import type { Command } from '../../commands/types.js';
import type { Opener } from '../../openers/types.js';
import type { TabPluginDeclaration } from '../api.js';
import { basicErrors, commandClaimErrors, extensionClaimErrors } from './catalog.js';

function firstToken(command: string): string {
  return /^\S+/.exec(command.trimStart())?.[0]?.toLowerCase() ?? '';
}

// A rejected claim contributes no adapter. Registering one anyway would park a dead route on a
// command name or extension — reachable only to report that the plugin is disabled, and able to
// shadow a later declaration's valid claim on the same name.
//
// Rejection is per claim kind, because each registry only knows the core list it composes with: a
// declaration rejected for its command claim keeps its opener adapter, and the host still disables
// the plugin the moment that opener fires. What never happens is a claim silently winning on
// catalog order.
function accepted(
  declarations: readonly TabPluginDeclaration[], claimErrors: Map<string, string>,
): readonly TabPluginDeclaration[] {
  const basic = basicErrors(declarations);
  return declarations.filter((declaration) => !basic.has(declaration.id) && !claimErrors.has(declaration.id));
}

export function pluginCommands(
  declarations: readonly TabPluginDeclaration[],
  coreCommands: readonly Command[],
  textualCommands: readonly string[],
): Command[] {
  const usable = accepted(declarations, commandClaimErrors(declarations, coreCommands, textualCommands));
  return usable.flatMap((declaration) => (declaration.commands ?? []).map((name) => ({
    name,
    match: (command: string) => firstToken(command) === name.toLowerCase(),
    run: (command, tab, managers) => managers.plugins.runCommand(declaration.id, name, command, tab.label),
  })));
}

export function pluginOpeners(
  declarations: readonly TabPluginDeclaration[], coreOpeners: readonly Opener[],
): Opener[] {
  const usable = accepted(declarations, extensionClaimErrors(declarations, coreOpeners));
  return usable.flatMap((declaration) => declaration.opener ? [{
    name: `plugin:${declaration.id}`,
    extensions: declaration.opener.extensions.map((extension) => extension.toLowerCase()),
    plugin: { id: declaration.id, editAction: declaration.opener.editAction },
    inline: (file, context) => context.invokePluginOpener(declaration.id, 'inline', file),
    external: (file, context) => context.invokePluginOpener(declaration.id, 'external', file),
  }] : []);
}
