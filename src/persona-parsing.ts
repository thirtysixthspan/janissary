const ROLE_PREFIX = '[//]: # role:';

export function parseRoleDirective(name: string, line: string): string {
  if (!line.startsWith(ROLE_PREFIX)) {
    throw new Error(`Persona "${name}" has no role directive. First line must be: [//]: # role:<name>.`);
  }
  const role = line.slice(ROLE_PREFIX.length).trim();
  if (!role) {
    throw new Error(`Persona "${name}" has a malformed role directive.`);
  }
  return role;
}
