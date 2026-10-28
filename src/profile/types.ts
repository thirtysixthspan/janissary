export type ProfileRow = { name: string; source: 'project' | 'janissary' };

export type ProfileParsed =
  | { error: string }
  | { action: 'list' }
  | { action: 'launch'; name: string };
