const ROLE_PREFIX = '[//]: # role: ';

export function parseDirective(name: string, line: string): string {
  const role = line.startsWith(ROLE_PREFIX) ? line.slice(ROLE_PREFIX.length).trim() : '';
  if (!role) {
    throw new Error(`Persona "${name}": expected first line [//]: # role: <role>.`);
  }
  return role;
}
