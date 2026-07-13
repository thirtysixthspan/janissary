import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Controller } from './controller.js';
import { initAgentStateDirectory, saveAgentState } from './agent/state.js';

// These tests spawn a real persistent shell (ShellManager.getShell → child_process.spawn) and
// then tear it down via Controller.shutdown → ShellManager.closeAll, which calls the real
// ChildProcess#kill(). Seatbelt denies the `signal` operation by default (there's no `(allow
// signal ...)` rule in sandbox-profile.ts, and default is deny), so kill() throws EPERM whenever
// the test runner itself is executing inside a sandboxed workspace. Kept out of `npm test` /
// `npm run check` for that reason — run via `npm run test:unsandboxed` on the host.
vi.mock('./openers/os-open.js', () => ({ didOsOpen: () => true }));

const makeController = () => {
  let states = 0;
  const c = new Controller({ emitState: () => { states++; }, sendPty: () => {}, sendPtyExit: () => {} });
  return { c, get states() { return states; } };
};

const allText = (c: Controller) => c.view().flatMap((t) => t.bufferLines).map((l) => l.text).join('\n');

describe('Controller — real shell lifecycle', () => {
  it('starts an agent shell in its saved/workspace cwd', async () => {
    initAgentStateDirectory(mkdtempSync(path.join(tmpdir(), 'janus-st-')));
    const workCwd = realpathSync(mkdtempSync(path.join(tmpdir(), 'janus-work-')));
    saveAgentState({ name: 'bob', dotColor: '#6bcb77', active: false, number: 1, cwd: workCwd });
    const { c } = makeController();
    c.rehydrate(); // restores the bob tab with cwd = workCwd
    c.dispatch('shell pwd'); // runs in bob's shell, which should have cd'd into workCwd
    const deadline = Date.now() + 4000;
    while (!allText(c).includes(workCwd) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(allText(c)).toContain(workCwd);
    c.shutdown();
  });
});

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
