export const ACP_ROLES = ['ask', 'tell'] as const;

export type AcpRole = string;

export const DEFAULT_ACP_ROLE: AcpRole = 'ask';

// Role names come from a user-edited roles file, so the prefix is tested as a literal string with a
// word boundary rather than interpolated into a regular expression.
export function afterRolePrefix(command: string, role: AcpRole): string | undefined {
  const trimmed = command.trim();
  const name = role.toLowerCase();
  if (!trimmed.toLowerCase().startsWith(name)) return undefined;
  const rest = trimmed.slice(name.length);
  return rest === '' || /^\s/iu.test(rest) ? rest.trim() : undefined;
}
