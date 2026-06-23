import { describe, it, expect, vi } from 'vitest';
import { createCommandHandler } from './command-handler.js';
import { makeTab } from './tab.js';
import type { CommandHandlerDeps } from './types.js';

// Build a minimal context covering the fields the unknown-command dispatch path touches.
function makeCtx(overrides: Partial<CommandHandlerDeps> = {}): {
  ctx: CommandHandlerDeps;
  runShellInTab: ReturnType<typeof vi.fn>;
  openRouteChooser: ReturnType<typeof vi.fn>;
} {
  const runShellInTab = vi.fn();
  const openRouteChooser = vi.fn();
  const ctx = {
    tabs: [makeTab('janus', '#fff', 1)],
    activeTab: 0,
    updateCurrentTab: vi.fn(),
    updateTab: vi.fn(),
    setAgentStates: vi.fn(),
    setInteractive: vi.fn(),
    cwdRef: { current: {} },
    runShellInTab,
    getOpenDbs: () => [],
    openRouteChooser,
    ...overrides,
  } as unknown as CommandHandlerDeps;
  return { ctx, runShellInTab, openRouteChooser };
}

describe('command-handler probabilistic dispatch', () => {
  it('auto-routes a confident shell command to the shell', () => {
    const { ctx, runShellInTab, openRouteChooser } = makeCtx();
    createCommandHandler(ctx)('git status');
    expect(runShellInTab).toHaveBeenCalledWith(0, 'janus', 'git status');
    expect(openRouteChooser).not.toHaveBeenCalled();
  });

  it('opens the route chooser when no route is confident', () => {
    const { ctx, openRouteChooser } = makeCtx({ getOpenDbs: () => ['movies'] });
    createCommandHandler(ctx)('movies');
    expect(openRouteChooser).toHaveBeenCalledTimes(1);
    const [cmd, choices] = openRouteChooser.mock.calls[0];
    expect(cmd).toBe('movies');
    // shell + db:movies + acp
    expect(choices.map((c: { route: string }) => c.route)).toEqual(['shell', 'db', 'acp']);
  });

  it('routes a SQL query to the chooser when several databases are open (ambiguous target)', () => {
    const { ctx, openRouteChooser } = makeCtx({ getOpenDbs: () => ['movies', 'actors'] });
    createCommandHandler(ctx)('SELECT * FROM actors');
    expect(openRouteChooser).toHaveBeenCalledTimes(1);
  });

  it('does not engage recognition for a known built-in or prefixed command', () => {
    const { ctx, runShellInTab, openRouteChooser } = makeCtx();
    createCommandHandler(ctx)('shell ls -la');
    expect(runShellInTab).toHaveBeenCalledWith(0, 'janus', 'ls -la');
    expect(openRouteChooser).not.toHaveBeenCalled();
  });
});
