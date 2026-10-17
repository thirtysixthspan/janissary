export const RESERVED_SYSTEM_LABEL_REFUSAL = 'Cannot use "system": that name is reserved for the system tab.';

export function isReservedTabLabel(label: string): boolean {
  return label.trim().toLowerCase() === 'system';
}
