export type ConnectionKind = 'sqlite' | 'shell' | 'acp' | 'browser' | 'ssh' | 'terminal';

export type ConnectionParsed =
  | { error: string }
  | { action: 'list' }
  | { action: 'close'; kind: ConnectionKind; id: string };
