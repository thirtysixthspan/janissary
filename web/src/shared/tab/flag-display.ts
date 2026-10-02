import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { workspacedIcon, autoPermitIcon, browserIcon, syncIcon } from '../icons';

// `className` marks a flag drawn differently from the row's own: `browserInUse` is the browser flag
// while a browser is running behind the tab's endpoint, highlighted green, and `provisioning` spins
// its icon while the tab's workspace is still being cloned.
export const tabFlagDisplay: Record<string, { icon: IconDefinition; label: string; className?: string }> = {
  provisioning: { icon: syncIcon, label: 'Provisioning workspace', className: 'tab-flag--provisioning' },
  workspaced: { icon: workspacedIcon, label: 'Workspaced' },
  autoApprove: { icon: autoPermitIcon, label: 'Auto-permitting' },
  browser: { icon: browserIcon, label: 'E2E browser' },
  browserInUse: { icon: browserIcon, label: 'E2E browser in use', className: 'tab-flag--active' },
};
