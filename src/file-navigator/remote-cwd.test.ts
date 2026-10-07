import { describe, expect, it, vi } from 'vitest';
import type { Managers } from '../managers.js';
import { remoteCwd } from './remote-cwd.js';

function harness(options: { cwd?: string; workspace?: string; home?: string } = {}) {
  const out = vi.fn();
  const managers = {
    tab: { cwdOf: vi.fn(() => options.cwd ?? '/srv/work/src') },
    remote: {
      workspaceOf: vi.fn(() => options.workspace ?? '/srv/work'),
      homeOf: vi.fn(() => options.home ?? '/home/remote'),
    },
  } as unknown as Managers;
  return { managers, out };
}

describe('remoteCwd', () => {
  it('uses an agent cwd within the remote workspace for a bare command', () => {
    const h = harness();
    expect(remoteCwd(h.managers, 'agent', '', h.out)?.cwd).toBe('/srv/work/src');
  });

  it('falls back to the workspace root when the tab cwd is outside it', () => {
    const h = harness({ cwd: '/home/remote' });
    expect(remoteCwd(h.managers, 'harness', '', h.out)?.cwd).toBe('/srv/work');
  });

  it('refuses while the remote workspace is provisioning', () => {
    const h = harness({ workspace: undefined });
    (h.managers.remote.workspaceOf as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    expect(remoteCwd(h.managers, 'harness', '', h.out)).toBeUndefined();
    expect(h.out).toHaveBeenCalledWith('The remote workspace is not ready yet.');
  });

  it.each([
    ['relative paths', 'docs/guide.md', '/srv/work/src/docs/guide.md'],
    ['remote home paths', '~/.janissary/workspace/agent/notes', '/home/remote/.janissary/workspace/agent/notes'],
    ['$root paths', '$root/docs', '/srv/work/docs'],
  ])('resolves %s on the remote host', (_label, input, expected) => {
    const h = input.startsWith('~')
      ? harness({ workspace: '/home/remote/.janissary/workspace/agent', cwd: '/home/remote/.janissary/workspace/agent/src' })
      : harness();
    expect(remoteCwd(h.managers, 'agent', input, h.out)?.cwd).toBe(expected);
  });

  it('refuses an unknown remote home instead of expanding the local home', () => {
    const h = harness();
    (h.managers.remote.homeOf as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    expect(remoteCwd(h.managers, 'agent', '~/private', h.out)).toBeUndefined();
    expect(h.out).toHaveBeenCalledWith('"/~/private" is outside the remote workspace /srv/work.');
  });

  it('refuses paths that escape the remote workspace', () => {
    const h = harness();
    expect(remoteCwd(h.managers, 'agent', '../../outside', h.out)).toBeUndefined();
    expect(h.out).toHaveBeenCalledWith('"/srv/outside" is outside the remote workspace /srv/work.');
  });
});
