import { describe, expect, it } from 'vitest';
import type { ScheduleLaunchView } from '@shared/protocol';
import { initialScheduleTarget, reconcileRunscript, reconcileScheduleTarget } from './schedule-selection';

const view = (overrides: Partial<ScheduleLaunchView> = {}): ScheduleLaunchView => ({
  targets: ['janus', 'claude'], active: 'janus', runscripts: ['deploy', 'cleanup'], ...overrides,
});

describe('schedule target selection', () => {
  it('defaults to the active eligible tab or system when the system shell is active', () => {
    expect(initialScheduleTarget(view())).toEqual({ kind: 'tab', label: 'janus' });
    expect(initialScheduleTarget(view({ active: 'system' }))).toEqual({ kind: 'system' });
  });

  it('falls back through active eligible tab, first eligible tab, then system', () => {
    expect(initialScheduleTarget(view({ active: 'claude' }))).toEqual({ kind: 'tab', label: 'claude' });
    expect(initialScheduleTarget(view({ active: 'missing' }))).toEqual({ kind: 'tab', label: 'janus' });
    expect(initialScheduleTarget(view({ targets: [], active: 'missing' }))).toEqual({ kind: 'system' });
  });

  it('reconciles a stale remembered tab and preserves a system selection', () => {
    expect(reconcileScheduleTarget({ kind: 'tab', label: 'closed' }, view({ active: 'claude' })))
      .toEqual({ kind: 'tab', label: 'claude' });
    expect(reconcileScheduleTarget({ kind: 'system' }, view({ targets: [] }))).toEqual({ kind: 'system' });
  });
});

describe('runscript selection', () => {
  it('keeps a listed script and clears a script removed from the refreshed catalog', () => {
    expect(reconcileRunscript('deploy', view())).toBe('deploy');
    expect(reconcileRunscript('deploy', view({ runscripts: ['cleanup'] }))).toBe('');
  });
});
