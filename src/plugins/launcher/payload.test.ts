import { describe, expect, it } from 'vitest';
import type { TabActivityEntry } from '../api.js';
import { toRows } from './payload.js';

describe('launcher row projection', () => {
  it('carries the tab group number and color into each launcher row', () => {
    const tab: TabActivityEntry = {
      label: 'build', type: 'shell', group: 7, groupColor: '#c678dd',
      incarnation: 'build-incarnation', dotColor: '#5b9cff', active: false, busy: false,
      hasUnread: false, needsInput: false, lastActivity: 0, cwd: '/repo', logLength: 0, revision: 0,
    };

    expect(toRows([tab])).toMatchObject([{ label: 'build', group: 7, groupColor: '#c678dd' }]);
  });
});
