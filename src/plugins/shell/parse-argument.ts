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

function readShellArgumentToken(tokens: string[], index: number, state: ShellLaunchArgument): number | { error: string } {
  const lower = tokens[index].toLowerCase();
  if (FLAGS.has(lower)) {
    if (lower === '--offline') state.offline = true;
    else if (lower === '--no-workspace') state.workspace = false;
  } else if (lower.startsWith('-')) {
    return { error: `Unknown option "${tokens[index]}". ${SHELL_USAGE}` };
  } else if (lower === 'on') {
    state.remote = tokens[index + 1] ?? '';
    if (index + 1 < tokens.length) return index + 1;
  } else {
    state.name += `${tokens[index]} `;
  }
  return index;
}

export function parseShellArgument(argument: string): ShellLaunchArgument | { error: string } {
  const tokens = argument.trim().split(/\s+/u).filter(Boolean);
  const state: ShellLaunchArgument = { name: '', workspace: true, offline: false };
  let group: string | undefined;
  for (let index = 0; index < tokens.length; index++) {
    const groupClause = readGroupClause(tokens, index);
    if (groupClause && 'error' in groupClause) return groupClause;
    if (groupClause) {
      group = groupClause.group;
      index = groupClause.end;
      continue;
    }
    const nextIndex = readShellArgumentToken(tokens, index, state);
    if (typeof nextIndex !== 'number') return nextIndex;
    index = nextIndex;
  }
  return {
    ...state, name: state.name.trim().toLowerCase(), workspace: state.remote !== undefined || state.workspace,
    ...(group !== undefined && { group }),
  };
}
