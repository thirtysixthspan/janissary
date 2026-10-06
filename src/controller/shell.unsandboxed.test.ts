import { describe, it, expect, vi } from 'vitest';
import { createController } from '../controller.js';
import { seedRootAgentTab } from '../tab/root-agent-test-fixture.js';

// These tests spawn a real persistent shell (ShellManager.getShell → child_process.spawn) and
// then tear it down via Controller.shutdown → ShellManager.closeAll, which calls the real
// ChildProcess#kill(). Seatbelt denies the `signal` operation by default (there's no `(allow
// signal ...)` rule in src/sandbox/profile.ts, and default is deny), so kill() throws EPERM whenever
// the test runner itself is executing inside a sandboxed workspace. Kept out of `npm test` /
// `npm run check` for that reason — run via `npm run test:unsandboxed` on the host.
vi.mock('./openers/os-open.js', () => ({ didOsOpen: () => true }));

const makeController = () => {
  let states = 0;
  const c = createController({ emitState: () => { states++; }, sendPty: () => {}, sendPtyExit: () => {} });
  seedRootAgentTab(c.managers.tab);
  return { c, get states() { return states; } };
};

describe('Controller root-path display', () => {
  it('abbreviates the working directory on a command prompt to $root', () => {
    const { c } = makeController(); // janus cwd is the launch (root) directory
    c.dispatch('shell true');
    const prompt = c.view()[0].bufferLines.find((l) => l.type === 'prompt');
    expect(prompt?.cwd).toBe('$root/');
    c.shutdown();
  });

  it('abbreviates the shell working directory in the connections panel', () => {
    const { c } = makeController();
    c.dispatch('shell true');
    const shellConn = c.view()[0].connections.find((r) => r.kind === 'shell');
    expect(shellConn?.text).toContain('$root/');
    c.shutdown();
  });
});
