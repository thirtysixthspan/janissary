import type { Command } from '../commands/types.js';
import { RESERVED_NON_COMMAND_NAMES } from '../commands/reserved.js';
import type { TabPluginDeclaration } from './api.js';
import { rejectContribution } from './rejections.js';

// The one `shell` route still handled ahead of the registry: `shell` is stripped by
// `resolveCommand` itself and has no registry entry. `harness` and `ssh` used to be listed here
// too, and `schedule` (whose bare form used to be a pre-registry branch in `CommandManager.run`)
// were before their registry migrations; they are `Command` entries now, so `coreCommands`
// reserves them and this list no longer has to.
const ROUTE_NAMES = ['shell'];

function firstToken(command: string): string {
  return command.trimStart().split(/\s/u, 1)[0].toLowerCase();
}

// The name a built-in command actually answers to, or `undefined` when it does not answer to its own
// bare name. Most commands match a form starting with their name, but one does not: the transcript
// search is registered as `search` while matching only `search transcript <pattern>`, so a bare
// `search` reaches nothing of its. Reserving that name anyway would refuse a plugin that claims it
// for a tab the built-in never touches.
//
// This is the reservation question, not the dispatch question — `resolveCommand` still walks the
// registry in order, so a built-in that matches the same input keeps winning. All this decides is
// which names a plugin may hold at all.
function reservedName(command: Command): string | undefined {
  const name = command.name.toLowerCase();
  return command.match(name) ? name : undefined;
}

// Builds one command per declaration that claims a name. A reserved or already-claimed name is
// refused: that plugin contributes no command and is recorded so the host can report it as disabled,
// rather than throwing while the command registry is being built at module load.
//
// A claim on a name a built-in does not answer to is admitted, and two things make that safe. The
// built-in is only reached for a longer form of the name, so the bare token is genuinely free; and
// this command yields whenever a core command already matches the input, so `search transcript fox`
// reaches the built-in and a bare `search` reaches the plugin. Without that second guard a claim
// matched on its first token alone would swallow every longer form the built-in owns.
export function createPluginCommands(
  declarations: readonly TabPluginDeclaration[],
  coreCommands: readonly Command[],
): Command[] {
  const reserved = new Set([
    ...coreCommands.map((command) => reservedName(command))
      .filter((name): name is string => name !== undefined),
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
    // The core commands whose name this claim shares. `resolveCommand` walks the registry with
    // core entries first, so each one keeps the longer forms of the name it owns.
    const shadowed = coreCommands.filter(
      (command) => command.name.toLowerCase() === name,
    );
    commands.push({
      name,
      match: (command) => firstToken(command) === name
        && shadowed.every((core) => !core.match(command)),
      samples: [name],
      run: (command, tab, managers) => managers.plugins.runCommand(
        declaration.id,
        command,
        { label: tab.label, command },
      ),
    });
  }
  return commands;
}
