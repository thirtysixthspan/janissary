import { describe, it, expect, vi } from 'vitest';
import { operationFailureText, reportOperationFailure } from './operation-report.js';
import { NOTIFICATIONS_LABEL } from '../notifications-tab.js';
import type { Managers } from '../managers.js';

describe('operationFailureText', () => {
  it('names a single failure', () => {
    expect(operationFailureText('delete', { total: 1, failedPaths: ['notes.md'] }))
      .toBe('Could not delete 1 of 1 items: notes.md');
  });

  it('names several failures in selection order', () => {
    expect(operationFailureText('move', { total: 5, failedPaths: ['a.md', 'src'] }))
      .toBe('Could not move 2 of 5 items: a.md, src');
  });

  it('truncates past three names', () => {
    expect(operationFailureText('copy', { total: 4, failedPaths: ['a', 'b', 'c', 'd'] }))
      .toBe('Could not copy 4 of 4 items: a, b, c, … and 1 more');
  });
});

describe('reportOperationFailure', () => {
  function makeManagers(append: ReturnType<typeof vi.fn>): Managers {
    const notif = { label: NOTIFICATIONS_LABEL, view: 'notifications', log: [] };
    const active = { label: 'agent', log: [] };
    return { tab: { tabs: [active, notif], cur: () => active, append } } as unknown as Managers;
  }

  it('posts no notification when there are no failures', () => {
    const append = vi.fn();
    reportOperationFailure(makeManagers(append), 'agent', 'delete', { total: 1, failedPaths: [] });
    expect(append).not.toHaveBeenCalled();
  });

  it('posts one notification when there are failures', () => {
    const append = vi.fn();
    reportOperationFailure(makeManagers(append), 'agent', 'delete', { total: 1, failedPaths: ['notes.md'] });
    expect(append).toHaveBeenCalledTimes(1);
  });
});
