export type ConnectionKind = 'sqlite' | 'shell' | 'acp' | 'browser' | 'ssh';

export type ConnectionParsed =
  | { error: string }
  | { action: 'list' }
  | { action: 'close'; kind: ConnectionKind; id: string };
