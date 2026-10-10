// Everything after `diff`, read the way `zsh` reads everything after `zsh`: a case-insensitive `on`
// lifts the token after it as the tab name the workspace belongs to, and the remaining words are
// the path. Pure — the command handler acts on the result.

export const DIFF_USAGE = 'Usage: diff [path] [on <tab name>]';

export type DiffArgument = { path: string; tab?: string };

export function parseDiffArgument(argument: string): DiffArgument | { error: string } {
  const tokens = argument.trim().split(/\s+/u).filter(Boolean);
  const words: string[] = [];
  let tab: string | undefined;
  for (let index = 0; index < tokens.length; index++) {
    const lower = tokens[index].toLowerCase();
    if (lower === 'on') {
      tab = tokens[index + 1] ?? '';
      if (index + 1 < tokens.length) index++;
    } else {
      words.push(tokens[index]);
    }
  }
  const path = words.join(' ');
  // One route or the other: a path resolves against the project the command was typed in and a tab
  // names a workspace that is not necessarily in it, so a line carrying both would have two answers
  // for which root it means.
  if (tab === '' || (tab !== undefined && path !== '')) return { error: DIFF_USAGE };
  return { path, ...(tab !== undefined && { tab }) };
}
