import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { workspacedIcon, autoPermitIcon, browserIcon } from '../icons';

// `className` marks a flag drawn in a state color rather than the row's own: `browserInUse` is the
// browser flag while a browser is running behind the tab's endpoint, highlighted green.
export const tabFlagDisplay: Record<string, { icon: IconDefinition; label: string; className?: string }> = {
  workspaced: { icon: workspacedIcon, label: 'Workspaced' },
  autoApprove: { icon: autoPermitIcon, label: 'Auto-permitting' },
  browser: { icon: browserIcon, label: 'E2E browser' },
  browserInUse: { icon: browserIcon, label: 'E2E browser in use', className: 'tab-flag--active' },
};
