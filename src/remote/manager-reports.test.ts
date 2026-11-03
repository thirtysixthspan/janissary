import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { reportRemoteWorkspaceReady } from './manager-reports.js';

const notifications = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../notifications/index.js', () => ({ notify: notifications.notify }));

const managers = {} as Managers;

describe('reportRemoteWorkspaceReady', () => {
  beforeEach(() => { notifications.notify.mockReset(); });

  it('reports how long the remote clone took, naming its host', () => {
    reportRemoteWorkspaceReady(managers, 'claude', 'devbox', '/srv/proj/.janissary/workspace/claude', 4210);
    expect(notifications.notify).toHaveBeenCalledExactlyOnceWith(
      managers, 'workspace-ready', 'claude', 'Prepared workspace $workspace/claude on devbox in 4.2s.',
    );
  });

  it('reports nothing when the host sent no time', () => {
    reportRemoteWorkspaceReady(managers, 'claude', 'devbox', '/srv/proj/.janissary/workspace/claude', undefined);
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
