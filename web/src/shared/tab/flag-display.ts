import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { workspacedIcon, autoPermitIcon, browserIcon } from '../icons';

export const tabFlagDisplay: Record<string, { icon: IconDefinition; label: string }> = {
  workspaced: { icon: workspacedIcon, label: 'Workspaced' },
  autoApprove: { icon: autoPermitIcon, label: 'Auto-permitting' },
  browser: { icon: browserIcon, label: 'E2E browser' },
};
