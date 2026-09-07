import type { Command } from '../commands/types.js';
import { RESERVED_NON_COMMAND_NAMES } from '../commands/reserved.js';
import type { TabPluginDeclaration } from './api.js';
import { rejectContribution } from './rejections.js';

// The two routes still handled ahead of `resolveCommand`, so a plugin claiming one would never be
// reached: bare `schedule` opens its dialog in `CommandManager.run`, and `shell` is stripped by
// `resolveCommand` itself and has no registry entry. `harness` and `ssh` used to be listed here too;
// they are `Command` entries now, so `coreCommands` reserves them and this list no longer has to.
const ROUTE_NAMES = ['schedule', 'shell'];

function firstToken(command: string): string {
  return command.trimStart().split(/\s/u, 1)[0].toLowerCase();
}

// Builds one command per declaration that claims a name. A reserved or already-claimed name is
// refused: that plugin contributes no command and is recorded so the host can report it as disabled,
// rather than throwing while the command registry is being built at module load.
export function createPluginCommands(
  declarations: readonly TabPluginDeclaration[],
  coreCommands: readonly Command[],
): Command[] {
  const reserved = new Set([
    ...coreCommands.map((command) => command.name.toLowerCase()),
    ...RESERVED_NON_COMMAND_NAMES.map((command) => command.toLowerCase()),
    ...ROUTE_NAMES,
  ]);
  const claims = new Set<string>();
  const commands: Command[] = [];
  for (const declaration of declarations) {
    if (!declaration.command) continue;
    const name = declaration.command.toLowerCase();
    if (reserved.has(name)) {
      rejectContribution(declaration.id, `reserved tab plugin command claim "${name}"`);
      continue;
    }
    if (claims.has(name)) {
      rejectContribution(declaration.id, `duplicate tab plugin command claim "${name}"`);
      continue;
    }
    claims.add(name);
    commands.push({
      name,
      match: (command) => firstToken(command) === name,
      run: (command, tab, managers) => managers.plugins.runCommand(
        declaration.id,
        command,
        { label: tab.label, command },
      ),
    });
  }
  return commands;
}
