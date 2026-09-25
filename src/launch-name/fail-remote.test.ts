import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const notify = vi.hoisted(() => vi.fn());
vi.mock('../notifications/index.js', () => ({ notify }));

import {
  failRemoteLaunch, reportRemoteCleanup, reportRemoteClone, MAX_REMOTE_NAME_ATTEMPTS, type RemoteNameRetry,
} from './fail-remote.js';
import { LaunchCheckUnanswered, LaunchNameRefusal, RemoteRootRefusal } from './refusal.js';
import { clonedNotice, rootRefusalMessage } from './messages.js';
import type { Managers } from '../managers.js';

function makeManagers(labels: string[]): { managers: Managers; labels: string[] } {
  const managers = {
    tab: {
      findIndex: (label: string) => labels.indexOf(label),
      closeTab: vi.fn((index: number) => { labels.splice(index, 1); }),
    },
  } as unknown as Managers;
  return { managers, labels };
}

function retry(overrides: Partial<RemoteNameRetry> = {}): RemoteNameRetry {
  return { creator: 'janus', explicit: false, tried: ['claude'], relaunch: vi.fn(), ...overrides };
}

describe('failRemoteLaunch', () => {
  beforeEach(() => { vi.useFakeTimers(); notify.mockClear(); });
  afterEach(() => { vi.useRealTimers(); });

  it('refuses an explicit running name at once, closing the tab without showing an error', () => {
    const { managers, labels } = makeManagers(['janus', 'foo']);
    const show = vi.fn();
    const nameRetry = retry({ explicit: true, tried: ['foo'] });

    failRemoteLaunch(managers, {
      label: 'foo', kind: 'harness', error: new LaunchNameRefusal('foo', 'devbox'), message: 'x', retry: nameRetry, show,
    });

    expect(labels).toEqual(['janus']);
    expect(show).not.toHaveBeenCalled();
    expect(nameRetry.relaunch).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(managers, 'launch-refused', 'janus', 'Cannot launch "foo": "foo" is already running on devbox.');
  });

  it('closes a default name silently and relaunches past every label tried', () => {
    const { managers, labels } = makeManagers(['janus', 'claude-2']);
    const nameRetry = retry({ tried: ['claude', 'claude-2'] });

    failRemoteLaunch(managers, {
      label: 'claude-2', kind: 'harness', error: new LaunchNameRefusal('claude-2', 'devbox'), message: 'x', retry: nameRetry, show: vi.fn(),
    });

    expect(labels).toEqual(['janus']);
    expect(nameRetry.relaunch).toHaveBeenCalledWith(['claude', 'claude-2']);
    expect(notify).not.toHaveBeenCalled();
  });

  it('gives up on a default harness name at the fifth refusal with one notice', () => {
    const { managers } = makeManagers(['janus', 'claude-5']);
    const tried = ['claude', 'claude-2', 'claude-3', 'claude-4', 'claude-5'];
    expect(tried).toHaveLength(MAX_REMOTE_NAME_ATTEMPTS);
    const nameRetry = retry({ tried });

    failRemoteLaunch(managers, {
      label: 'claude-5', kind: 'harness', error: new LaunchNameRefusal('claude-5', 'devbox'), message: 'x', retry: nameRetry, show: vi.fn(),
    });

    expect(nameRetry.relaunch).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(managers, 'launch-refused', 'janus',
      'Cannot launch "claude": "claude" through "claude-5" are already running on devbox.');
  });

  it('gives up on a pool name at the fifth refusal, naming every name tried', () => {
    const { managers } = makeManagers(['janus', 'eda']);
    const tried = ['ada', 'bekir', 'cem', 'derya', 'eda'];

    failRemoteLaunch(managers, {
      label: 'eda', kind: 'agent', error: new LaunchNameRefusal('eda', 'devbox'), message: 'x', retry: retry({ tried }), show: vi.fn(),
    });

    expect(notify).toHaveBeenCalledWith(managers, 'launch-refused', 'janus',
      'Cannot launch agent on devbox: 5 names tried (ada, bekir, cem, derya, eda) are already running on devbox.');
  });

  it('refuses a failed leftover removal at once, whatever kind of name it was', () => {
    const { managers, labels } = makeManagers(['janus', 'claude']);
    const nameRetry = retry();

    failRemoteLaunch(managers, {
      label: 'claude', kind: 'harness', error: new LaunchNameRefusal('claude', 'devbox', '/srv/ws/claude', 'EACCES: permission denied'),
      message: 'x', retry: nameRetry, show: vi.fn(),
    });

    expect(labels).toEqual(['janus']);
    expect(nameRetry.relaunch).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(managers, 'launch-refused', 'janus',
      'Cannot launch "claude": could not remove leftover workspace "claude" on devbox (/srv/ws/claude) — EACCES: permission denied.');
  });

  it('shows an unanswered check on the tab, refuses it in the feed, and closes after the delay', async () => {
    const { managers, labels } = makeManagers(['janus', 'claude']);
    const show = vi.fn();
    const message = 'Remote session to devbox ended before its workspace was ready.';

    failRemoteLaunch(managers, {
      label: 'claude', kind: 'harness', error: new LaunchCheckUnanswered('devbox', message), message, retry: retry(), show,
    });

    expect(show).toHaveBeenCalledWith(message);
    expect(notify).toHaveBeenCalledWith(managers, 'launch-refused', 'janus',
      'Cannot launch "claude": could not check devbox for an existing "claude" — Remote session to devbox ended before its workspace was ready.');
    expect(labels).toEqual(['janus', 'claude']);
    await vi.advanceTimersByTimeAsync(3000);
    expect(labels).toEqual(['janus']);
  });

  it('keeps today\'s behavior for any other failure, posting nothing', async () => {
    const { managers, labels } = makeManagers(['janus', 'claude']);
    const show = vi.fn();

    failRemoteLaunch(managers, {
      label: 'claude', kind: 'harness', error: new Error('git clone exited with code 128'),
      message: 'git clone exited with code 128', retry: retry(), show,
    });

    expect(show).toHaveBeenCalledWith('git clone exited with code 128');
    expect(notify).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2999);
    expect(labels).toEqual(['janus', 'claude']);
    await vi.advanceTimersByTimeAsync(1);
    expect(labels).toEqual(['janus']);
  });

  it('shows a root refusal in its composed form, posts it, and closes after the delay', async () => {
    const { managers, labels } = makeManagers(['janus', 'fariz']);
    const show = vi.fn();
    const error = new RemoteRootRefusal('thecandykingdom', { kind: 'declined', path: '/srv/proj', url: 'u' });
    const line = 'Cannot launch "fariz": /srv/proj on thecandykingdom is not a clone of this project — clone declined.';

    failRemoteLaunch(managers, { label: 'fariz', kind: 'agent', error, message: error.message, retry: retry(), show });

    expect(show).toHaveBeenCalledWith(line);
    expect(notify).toHaveBeenCalledExactlyOnceWith(managers, 'launch-refused', 'janus', line);
    expect(labels).toEqual(['janus', 'fariz']);
    await vi.advanceTimersByTimeAsync(3000);
    expect(labels).toEqual(['janus']);
  });

  it('treats a refusal with no retry context (an attach) as an ordinary failure', () => {
    const { managers } = makeManagers(['janus', 'claude']);
    const show = vi.fn();

    failRemoteLaunch(managers, { label: 'claude', kind: 'harness', error: new LaunchNameRefusal('claude', 'devbox'), message: 'm', show });

    expect(show).toHaveBeenCalledWith('m');
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('reportRemoteCleanup', () => {
  beforeEach(() => { notify.mockClear(); });

  it('posts the remote cleanup against the creator', () => {
    const { managers } = makeManagers([]);
    reportRemoteCleanup(managers, retry(), 'claude', 'devbox', '/srv/ws/claude');
    expect(notify).toHaveBeenCalledWith(managers, 'launch-workspace-cleaned', 'janus',
      'Removed leftover workspace "claude" on devbox (/srv/ws/claude) before launching.');
  });

  it('posts nothing when nothing was cleaned, or for an attach', () => {
    const { managers } = makeManagers([]);
    reportRemoteCleanup(managers, retry(), 'claude', 'devbox', undefined);
    reportRemoteCleanup(managers, undefined, 'claude', 'devbox', '/srv/ws/claude');
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('reportRemoteClone', () => {
  beforeEach(() => { notify.mockClear(); });

  it('posts the root clone against the creator', () => {
    const { managers } = makeManagers([]);
    reportRemoteClone(managers, retry(), 'devbox', { url: 'https://github.com/o/repo.git', path: '/home/ada/repo' });
    expect(notify).toHaveBeenCalledWith(managers, 'launch-root-cloned', 'janus',
      'Cloned https://github.com/o/repo.git into /home/ada/repo on devbox.');
  });

  it('posts nothing when nothing was cloned, or for an attach', () => {
    const { managers } = makeManagers([]);
    reportRemoteClone(managers, retry(), 'devbox', undefined);
    reportRemoteClone(managers, undefined, 'devbox', { url: 'u', path: '/p' });
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('rootRefusalMessage', () => {
  const url = 'https://github.com/o/repo.git';
  it.each([
    [{ kind: 'declined', path: '/srv/proj', url }, 'Cannot launch "fariz": /srv/proj on devbox is not a clone of this project — clone declined.'],
    [{ kind: 'clone-failed', path: '/srv/proj', url, reason: 'fatal: Authentication failed.' },
      `Cannot launch "fariz": cloning ${url} into /srv/proj on devbox failed — fatal: Authentication failed.`],
    [{ kind: 'different-origin', path: '/srv/proj', other: 'git@github.com:o/other.git', url },
      `Cannot launch "fariz": /srv/proj on devbox is a clone of git@github.com:o/other.git, not ${url}.`],
    [{ kind: 'not-repository', path: '/srv/proj' }, 'Cannot launch "fariz": /srv/proj on devbox is not a git repository.'],
    [{ kind: 'occupied', path: '/home/ada/repo' }, 'Cannot launch "fariz": /home/ada/repo on devbox exists and is not a clone of this project.'],
    [{ kind: 'no-origin', path: '/srv/proj' }, 'Cannot launch "fariz": /srv/proj on devbox has no "origin" remote.'],
    [{ kind: 'no-repo-name', path: '/home/ada', url: 'https://github.com/' },
      'Cannot launch "fariz": cannot name a folder for https://github.com/ under /home/ada on devbox.'],
    [{ kind: 'not-found', path: '/srv/proj' }, 'Cannot launch "fariz": /srv/proj on devbox does not exist.'],
    [{ kind: 'no-repository-found', path: '/home/ada' }, 'Cannot launch "fariz": no git repository found at or above /home/ada on devbox.'],
  ] as const)('words a $kind refusal', (refusal, line) => {
    expect(rootRefusalMessage('fariz', 'devbox', refusal)).toBe(line);
  });

  it('words the clone notice', () => {
    expect(clonedNotice(url, '/home/ada/repo', 'devbox')).toBe(`Cloned ${url} into /home/ada/repo on devbox.`);
  });
});
