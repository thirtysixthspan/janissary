import { vi, describe, it, expect } from 'vitest';
import { render } from 'ink-testing-library';

vi.hoisted(() => {
  process.argv.push('--relaunch');
});

vi.mock('./agent-state.js', () => ({
  initAgentStateDir: vi.fn(),
  saveAgentState: vi.fn(),
  loadAgentState: vi.fn(),
  clearStateDir: vi.fn(),
  listAgentStates: vi.fn(() => [
    { name: 'janus', dotColor: '#5b9cff', cmdHistory: [], log: [] },
    { name: 'refactor', dotColor: '#ff6b6b', cmdHistory: [], log: [] },
  ]),
}));

import { App } from './cli.js';

describe('tab swap integration', () => {
  it('swaps tabs left and right with ctrl+arrow keys', async () => {
    const { lastFrame, stdin } = render(<App />);

    // Give React time to render
    await new Promise(r => setTimeout(r, 50));
    let frame = lastFrame();
    expect(frame).toContain('janus');
    expect(frame).toContain('refactor');

    // Verify initial order: janus (active, index 0) then refactor (index 1)
    expect(frame!.indexOf('janus')).toBeLessThan(frame!.indexOf('refactor'));

    // Ctrl+RightArrow: swap janus (index 0) with refactor (index 1)
    stdin.write('\u001b[1;5C');
    await new Promise(r => setTimeout(r, 50));

    frame = lastFrame();
    // refactor should now appear before janus
    expect(frame!.indexOf('refactor')).toBeLessThan(frame!.indexOf('janus'));

    // Ctrl+LeftArrow: swap back
    stdin.write('\u001b[1;5D');
    await new Promise(r => setTimeout(r, 50));

    frame = lastFrame();
    // janus should be first again
    expect(frame!.indexOf('janus')).toBeLessThan(frame!.indexOf('refactor'));
  });
});
