import { opensShellHistory, transcriptSearchQuery } from './command-line-rules';

// A line's local shell route, when the application's published settings still allow it. A disabled
// `hist` or `search` falls through to the server, which refuses it.
export type ShellLocalRoute = 'history' | { find: string };

export function localRoute(
  text: string,
  appBar: { disabledApplicationCommand: (line: string) => boolean },
): ShellLocalRoute | undefined {
  if (appBar.disabledApplicationCommand(text)) return undefined;
  if (opensShellHistory(text)) return 'history';
  const query = transcriptSearchQuery(text);
  return query === undefined ? undefined : { find: query };
}
