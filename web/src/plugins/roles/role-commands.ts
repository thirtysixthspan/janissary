export function orderedRoleCommands(commands: readonly string[], vocabulary: readonly string[]): string[] {
  const native = vocabulary.flatMap((command) => commands.filter((stored) => stored === command));
  const unknown = commands.filter((command) => !vocabulary.includes(command));
  return [...native, ...unknown];
}

export function availableRoleCommands(commands: readonly string[], vocabulary: readonly string[]): string[] {
  return vocabulary.filter((command) => !commands.includes(command));
}

export function canAddRoleCommand(commands: readonly string[], vocabulary: readonly string[]): boolean {
  return availableRoleCommands(commands, vocabulary).length > 0;
}
