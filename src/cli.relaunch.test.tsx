import { vi, describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';

vi.hoisted(() => {
  process.argv.push('--relaunch');
});

// Saved states are returned out of array order; the UI should restore them ordered by
// their recorded tab `number`.
vi.mock('./agent-state.js', () => ({
  initAgentStateDir: vi.fn(),
  saveAgentState: vi.fn(),
  loadAgentState: vi.fn(),
  clearStateDir: vi.fn(),
  listAgentStates: vi.fn(() => [
    { name: 'zulu', dotColor: '#ff6b6b', active: false, number: 2, cmdHistory: [], log: [] },
    { name: 'alpha', dotColor: '#5b9cff', active: false, number: 1, cmdHistory: [], log: [] },
  ]),
}));

import { App } from './cli.js';

describe('relaunch restore', () => {
  it('restores tabs in saved tab-number order', async () => {
    const { lastFrame } = render(<App />);
    await new Promise((r) => setTimeout(r, 50));
    const frame = lastFrame()!;
    // alpha (number 1) should appear before zulu (number 2), despite the array order.
    expect(frame.indexOf('alpha')).toBeLessThan(frame.indexOf('zulu'));
  });
});
