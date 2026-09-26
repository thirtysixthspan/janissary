import { describe, expect, it, vi } from 'vitest';
import { dispatchPluginMessage } from './plugin.js';
import type { Controller } from '../controller.js';
import type { ClientMessage } from '../protocol.js';

const makeController = () => ({
  managers: {},
  defaultMenuSelectionAction: vi.fn(() => ({ label: 'files-1', choices: [] })),
  runDefaultMenuSelectionAction: vi.fn(),
  pluginIntent: vi.fn(),
  pluginFailed: vi.fn(),
  editorPluginFailed: vi.fn(),
}) as unknown as Controller;

const dispatch = (controller: Controller, call: Omit<ClientMessage, 't' | 'id'>) =>
  dispatchPluginMessage(
    controller,
    { t: 'rpc', id: 1, ...call } as ClientMessage & { method: string },
  );

describe('dispatchPluginMessage default-menu cases', () => {
  it('replies with the current default-menu selection', () => {
    const controller = makeController();
    const result = dispatch(controller, { method: 'defaultMenuSelectionAction', params: {} });
    expect(controller.defaultMenuSelectionAction).toHaveBeenCalledOnce();
    expect(result).toEqual({ label: 'files-1', choices: [] });
  });

  // Running a selection is fire-and-forget: what it produces is the opened file or the chosen
  // plugin's own tab, not a reply, so the RPC acknowledges.
  it('runs the chosen action and acknowledges', () => {
    const controller = makeController();
    const result = dispatch(controller, {
      method: 'runDefaultMenuSelectionAction',
      params: { selection: 'first', action: 'open' },
    });
    expect(controller.runDefaultMenuSelectionAction).toHaveBeenCalledExactlyOnceWith('first', 'open');
    expect(result).toBeUndefined();
  });
});

describe('dispatchPluginMessage plugin cases', () => {
  it('hands a plugin intent its tab, intent, and payload untouched', () => {
    const controller = makeController();
    const result = dispatch(controller, {
      method: 'pluginIntent',
      params: { tab: 'files-1', intent: 'queue', payload: { ids: [1, 2] } },
    });
    expect(controller.pluginIntent).toHaveBeenCalledExactlyOnceWith('files-1', 'queue', { ids: [1, 2] });
    expect(result).toBeUndefined();
  });

  it('reports a plugin failure and acknowledges', () => {
    const controller = makeController();
    const result = dispatch(controller, {
      method: 'pluginFailed',
      params: { tab: 'files-1', reason: 'exports no handler' },
    });
    expect(controller.pluginFailed).toHaveBeenCalledExactlyOnceWith('files-1', 'exports no handler');
    expect(result).toBeUndefined();
  });

  it('reports an editor plugin failure and acknowledges', () => {
    const controller = makeController();
    const result = dispatch(controller, {
      method: 'editorPluginFailed',
      params: { url: '/open/1', plugin: 'commenting', reason: 'broke' },
    });
    expect(controller.editorPluginFailed).toHaveBeenCalledExactlyOnceWith('/open/1', 'commenting', 'broke');
    expect(result).toBeUndefined();
  });
});

// The dispatcher validates a method's params against the table before reaching here, so these
// re-checks are belt-and-braces. They are still load-bearing: this arm is what keeps a param the
// table let through from being read at a declared type it does not have.
describe('dispatchPluginMessage re-checks its params', () => {
  it.each([
    ['pluginIntent', 'Invalid pluginIntent params'],
    ['pluginFailed', 'Invalid pluginFailed params'],
    ['editorPluginFailed', 'Invalid editorPluginFailed params'],
  ] as const)('refuses %s carrying params the guard rejects', (method, message) => {
    const controller = makeController();
    const params = method === 'pluginIntent' ? { tab: 'files-1' }
      : method === 'pluginFailed' ? { tab: 7, reason: 'broke' }
      : { url: '/open/1', plugin: 'commenting' };
    expect(() => dispatch(controller, { method, params } as never)).toThrow(message);
    expect(controller.pluginIntent).not.toHaveBeenCalled();
    expect(controller.pluginFailed).not.toHaveBeenCalled();
    expect(controller.editorPluginFailed).not.toHaveBeenCalled();
  });
});
