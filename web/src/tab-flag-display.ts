import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { workspacedIcon, autoPermitIcon } from './icons';

export const tabFlagDisplay: Record<string, { icon: IconDefinition; label: string }> = {
  workspaced: { icon: workspacedIcon, label: 'Workspaced' },
  autoApprove: { icon: autoPermitIcon, label: 'Auto-permitting' },
};
