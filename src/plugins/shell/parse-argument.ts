// Everything after `shell`, read the way `agent` reads everything after `agent`: the workspace flags
// match case-insensitively, `--no-workspace` wins over `-w`, `on <address>` is lifted out of the name,
// and the remaining words, lowercased, are the name. Pure — the command handler acts on the result.

export const SHELL_USAGE = 'Usage: shell [name] [-w|--workspace|--no-workspace] [--offline] [on <address>] [in group <name|id>]';

export type ShellLaunchArgument = { name: string; workspace: boolean; offline: boolean; remote?: string; group?: string };

const FLAGS = new Set(['-w', '--workspace', '--no-workspace', '--offline']);

function validGroupSelector(value: string | undefined): value is string {
  if (!value) return false;
  if (!/^\d+$/u.test(value)) return true;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0;
}

function readGroupClause(tokens: string[], index: number): { group: string; end: number } | { error: string } | undefined {
  if (tokens[index].toLowerCase() !== 'in' || tokens[index + 1]?.toLowerCase() !== 'group') return undefined;
  const group = tokens[index + 2];
  if (!validGroupSelector(group)) return { error: `Invalid group name or ID. ${SHELL_USAGE}` };
  return { group, end: index + 2 };
}

export function parseShellArgument(argument: string): ShellLaunchArgument | { error: string } {
  const tokens = argument.trim().split(/\s+/u).filter(Boolean);
  const words: string[] = [];
  let noWorkspace = false;
  let offline = false;
  let remote: string | undefined;
  let group: string | undefined;
  for (let index = 0; index < tokens.length; index++) {
    const lower = tokens[index].toLowerCase();
    const groupClause = readGroupClause(tokens, index);
    if (groupClause && 'error' in groupClause) return groupClause;
    if (groupClause) {
      group = groupClause.group;
      index = groupClause.end;
      continue;
    }
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
    ...(remote !== undefined && { remote }), ...(group !== undefined && { group }),
  };
}
