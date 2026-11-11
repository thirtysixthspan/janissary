import { describe, it, expect } from 'vitest';
import { localReadRoot } from './tab-read.js';

type FakeTab = { label: string; workspaceDir?: string; remote?: unknown };

const managersWith = (tabs: FakeTab[]) => ({
  tab: {
    launchDir: '/launch',
    byLabel: (label: string) => tabs.find((tab) => tab.label === label),
  },
}) as never;

describe('localReadRoot', () => {
  it('returns the tab workspace', () => {
    expect(localReadRoot(managersWith([{ label: 'janus', workspaceDir: '/clone' }]), 'janus')).toBe('/clone');
  });

  it('falls back to the launch directory for a tab without a workspace or an unknown label', () => {
    const managers = managersWith([{ label: 'janus' }]);
    expect(localReadRoot(managers, 'janus')).toBe('/launch');
    expect(localReadRoot(managers, 'missing')).toBe('/launch');
  });

  it('returns undefined for a remote tab', () => {
    expect(localReadRoot(managersWith([{ label: 'far', workspaceDir: '/clone', remote: {} }]), 'far')).toBeUndefined();
  });
});
