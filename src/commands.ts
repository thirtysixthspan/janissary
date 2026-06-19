export const availableCommands = [
  'dashboard',
  'settings',
  'about',
  'help',
  'clear',
  'quit',
];

export const getOutput = (cmd: string): string | null => {
  const trimmed = cmd.trim().toLowerCase();

  if (trimmed === 'dashboard') return 'Welcome to the CLI dashboard.';
  if (trimmed === 'settings') return 'Settings panel — no settings yet.';
  if (trimmed === 'about') return 'Custom CLI built with Ink & React.';
  if (trimmed === 'help') return 'Built-in: ' + availableCommands.join(', ') + '. Prefix a command with ` to run it in the shell.';
  if (trimmed === 'clear') return null;
  if (trimmed === 'quit' || trimmed === 'exit') return null;
  if (trimmed === '') return null;
  return `Unknown command: "${trimmed}". Type "help" for available commands.`;
};
