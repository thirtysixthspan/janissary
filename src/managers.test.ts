import { describe, expect, it } from 'vitest';
import { createController } from './controller.js';
import { MANAGER_DISPOSE_ORDER, MANAGER_DISPOSE_ORDER_IS_COMPLETE, MANAGER_TAB_RELEASE, MANAGER_TAB_RELEASE_IS_TYPED } from './managers.js';

const positionOf = (name: string) => MANAGER_DISPOSE_ORDER.indexOf(name as never);

describe('MANAGER_DISPOSE_ORDER', () => {
  it('is declared complete, which the compiler checks by naming any missing manager', () => {
    expect(MANAGER_DISPOSE_ORDER_IS_COMPLETE).toBe(true);
  });

  // The `satisfies` clause rejects a name that is not a manager and the type assertion beside it
  // rejects a manager with no position, but neither can see a key written twice.
  it('lists every registered manager exactly once', () => {
    const controller = createController({ emitState: () => {}, sendPty: () => {}, sendPtyExit: () => {} });
    const registered = Object.keys(controller.managers);
    controller.shutdown();

    const byName = (a: string, b: string) => a.localeCompare(b);
    expect(new Set(MANAGER_DISPOSE_ORDER).size).toBe(MANAGER_DISPOSE_ORDER.length);
    expect([...MANAGER_DISPOSE_ORDER].toSorted(byName)).toEqual(registered.toSorted(byName));
  });

  // Each of these sends over a remote channel while tearing down — a PTY's `kill`, an ACP session's
  // `acp-close`, a navigator port's session close — and `RemoteChannel.send` drops a frame once the
  // channel is detached. Closing the channels first meant the far host was never told to stop.
  it.each([['pty'], ['acp'], ['fileNavigator']])('disposes %s before the remote transport it sends over', (name) => {
    expect(positionOf(name)).toBeLessThan(positionOf('remote'));
  });

  it('disposes the state the others read while tearing down last', () => {
    expect(MANAGER_DISPOSE_ORDER.slice(-3)).toEqual(['questions', 'tab', 'database']);
  });
});

describe('MANAGER_TAB_RELEASE', () => {
  it('is declared typed, which the compiler checks by naming any manager without closeTab(label)', () => {
    expect(MANAGER_TAB_RELEASE_IS_TYPED).toBe(true);
  });

  // The `satisfies` clause rejects a name that is not a manager and the type assertion beside it
  // rejects a manager without the method, but neither can see a key written twice.
  it('names each participating manager exactly once', () => {
    expect(new Set(MANAGER_TAB_RELEASE).size).toBe(MANAGER_TAB_RELEASE.length);
  });
});
