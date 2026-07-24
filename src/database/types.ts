export type DbParsed =
  | { error: string }
  | { action: 'create' | 'delete'; name: string }
  | { action: 'list' }
  | { action: 'query'; name: string; query: string };
