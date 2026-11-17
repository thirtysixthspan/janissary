import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reportProviderDisabled } from './disabled-notice.js';

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock('../notifications/index.js', () => ({ notify: mocks.notify }));

const managers = {} as never;

describe('reportProviderDisabled', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('notifies nothing when the callback is created', () => {
    reportProviderDisabled(managers, 'janus');
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('returns a callback that posts the disabled-provider notice', () => {
    const report = reportProviderDisabled(managers, 'janus');
    report('tavily', 'provider failed: boom');
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.notify).toHaveBeenCalledWith(
      managers,
      'plugin-failure',
      'janus',
      'Web provider "tavily" disabled: provider failed: boom.',
    );
  });
});
