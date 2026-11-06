export const ACP_ROLES = ['ask', 'tell'] as const;

export type AcpRole = (typeof ACP_ROLES)[number];

export const DEFAULT_ACP_ROLE: AcpRole = 'ask';
