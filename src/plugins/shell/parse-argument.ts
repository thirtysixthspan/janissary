// Everything after `zsh`, read the way `agent` reads everything after `agent`: the workspace flags
// match case-insensitively, `--no-workspace` wins over `-w`, `on <address>` is lifted out of the name,
// and the remaining words, lowercased, are the name. Pure — the command handler acts on the result.

export const SHELL_USAGE = 'Usage: zsh [name] [-w|--workspace|--no-workspace] [--offline] [on <address>]';

export type ShellLaunchArgument = { name: string; workspace: boolean; offline: boolean; remote?: string };

const FLAGS = new Set(['-w', '--workspace', '--no-workspace', '--offline']);

export function parseShellArgument(argument: string): ShellLaunchArgument | { error: string } {
  const tokens = argument.trim().split(/\s+/u).filter(Boolean);
  const words: string[] = [];
  let noWorkspace = false;
  let offline = false;
  let remote: string | undefined;
  for (let index = 0; index < tokens.length; index++) {
    const lower = tokens[index].toLowerCase();
    if (FLAGS.has(lower)) {
      if (lower === '--offline') offline = true;
      else if (lower === '--no-workspace') noWorkspace = true;
    } else if (lower.startsWith('-')) {
      return { error: `Unknown option "${tokens[index]}". ${SHELL_USAGE}` };
    } else if (lower === 'on') {
      remote = tokens[index + 1] ?? '';
      if (index + 1 < tokens.length) index++;
    } else {
      words.push(tokens[index]);
    }
  }
  return {
    name: words.join(' ').toLowerCase(), workspace: remote !== undefined || !noWorkspace, offline,
    ...(remote !== undefined && { remote }),
  };
}
