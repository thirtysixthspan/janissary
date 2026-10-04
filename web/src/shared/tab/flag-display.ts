import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { workspacedIcon, autoPermitIcon, autoResumeIcon, browserIcon, syncIcon } from '../icons';

// `className` marks a flag drawn differently from the row's own: `tab-flag--active` highlights green
// a workspace that has landed, an auto-approve that has cleared a prompt (`autoApproved`), an
// auto-resume waiting to be typed in (`autoResuming`), and a browser running behind the tab's
// endpoint (`browserInUse`); `provisioning` spins its icon in the
// workspace flag's place while the tab's workspace is still being cloned.
// Auto-resume draws its own glyph rather than auto-approve's bolt: the two can sit in one metadata
// row at once, and two identical icons with different tooltips read as one flag seen twice.
export const tabFlagDisplay: Record<string, { icon: IconDefinition; label: string; className?: string }> = {
  provisioning: { icon: syncIcon, label: 'Provisioning workspace', className: 'tab-flag--provisioning' },
  workspaced: { icon: workspacedIcon, label: 'Workspaced', className: 'tab-flag--active' },
  autoApprove: { icon: autoPermitIcon, label: 'Auto-permitting' },
  autoApproved: { icon: autoPermitIcon, label: 'Auto-approval', className: 'tab-flag--active' },
  autoResume: { icon: autoResumeIcon, label: 'Auto-resume' },
  autoResuming: { icon: autoResumeIcon, label: 'Auto-resuming', className: 'tab-flag--active' },
  browser: { icon: browserIcon, label: 'E2E browser' },
  browserInUse: { icon: browserIcon, label: 'E2E browser in use', className: 'tab-flag--active' },
};