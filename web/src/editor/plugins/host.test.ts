import { describe, expect, it, vi } from 'vitest';
import {
  EDITOR_PLUGIN_API_VERSION,
  type BoundBinding, type EditorPluginDeclaration, type EditorPluginHandler,
  type EditorPluginLoader, type EditorPluginRequest,
} from './api';
import { createEditorPluginHost } from './host';

function declaration(overrides: Partial<EditorPluginDeclaration> = {}): EditorPluginDeclaration {
  return {
    id: 'fixture',
    version: '1.0.0',
    apiVersion: EDITOR_PLUGIN_API_VERSION,
    bindings: [{ command: 'do-it', chord: { key: 'j', meta: true }, needs: 'selection' }],
    ...overrides,
  };
}

function loaderFor(handler: EditorPluginHandler): EditorPluginLoader {
  return () => Promise.resolve({ default: handler });
}

const REQUEST: EditorPluginRequest = {
  command: 'do-it',
  file: 'a.ts',
  selection: { anchor: null, cursor: { line: 0, col: 0 } },
  range: { start: { line: 0, col: 0 }, end: { line: 0, col: 1 } },
  lines: ['a'],
};

function setup(
  handler: EditorPluginHandler,
  declarations: EditorPluginDeclaration[] = [declaration()],
  timeoutMs?: number,
) {
  const onDisabled = vi.fn();
  const loader = vi.fn(loaderFor(handler));
  const host = createEditorPluginHost(onDisabled, {
    declarations: declarations as never,
    loaders: { fixture: loader, other: loaderFor(handler) },
    timeoutMs,
  });
  return { host, onDisabled, loader };
}

const bindingOf = (host: ReturnType<typeof setup>['host']): BoundBinding => host.bindings()[0];

describe('createEditorPluginHost', () => {
  it('answers the binding table without invoking any loader', () => {
    const { host, loader } = setup(() => null);
    expect(host.bindings()).toEqual([
      { plugin: 'fixture', command: 'do-it', chord: { key: 'j', meta: true }, needs: 'selection' },
    ]);
    expect(loader).not.toHaveBeenCalled();
  });

  it('loads a plugin exactly once across two presses', async () => {
    const { host, loader } = setup(() => ({ edits: [] }));
    const binding = bindingOf(host);
    await host.run(binding, REQUEST);
    await host.run(binding, REQUEST);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('loads only once when two presses race before the first resolves', async () => {
    const { host, loader } = setup(() => ({ edits: [] }));
    const binding = bindingOf(host);
    await Promise.all([host.run(binding, REQUEST), host.run(binding, REQUEST)]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('returns what the handler produced', async () => {
    const result = { edits: [{ start: { line: 0, col: 0 }, end: { line: 0, col: 0 }, text: 'x' }] };
    const { host } = setup(() => result);
    expect(await host.run(bindingOf(host), REQUEST)).toEqual({ status: 'ok', result });
  });

  it('normalises an undefined return to null', async () => {
    const { host } = setup(() => undefined as never);
    expect(await host.run(bindingOf(host), REQUEST)).toEqual({ status: 'ok', result: null });
  });

  it('disables a plugin whose handler throws, and reports once', async () => {
    const { host, onDisabled } = setup(() => { throw new Error('bad edit.'); });
    const binding = bindingOf(host);

    expect(await host.run(binding, REQUEST)).toEqual({ status: 'failed', reason: 'bad edit' });
    expect(onDisabled).toHaveBeenCalledExactlyOnceWith('fixture', 'bad edit');
    expect(host.bindings()).toEqual([]);

    // A second press against an already-disabled plugin answers, but reports nothing new.
    const outcome = await host.run(binding, REQUEST);
    expect(outcome.status).toBe('failed');
    expect(onDisabled).toHaveBeenCalledTimes(1);
  });

  it('disables a plugin whose handler rejects', async () => {
    const { host, onDisabled } = setup(() => Promise.reject(new Error('nope')));
    const outcome = await host.run(bindingOf(host), REQUEST);
    expect(outcome.status).toBe('failed');
    expect(onDisabled).toHaveBeenCalledExactlyOnceWith('fixture', 'nope');
  });

  it('disables a plugin whose handler exceeds its budget', async () => {
    const { host, onDisabled } = setup(
      () => new Promise(() => { /* never settles */ }), [declaration()], 5,
    );
    const outcome = await host.run(bindingOf(host), REQUEST);
    expect(outcome.status).toBe('failed');
    expect(onDisabled).toHaveBeenCalledOnce();
    expect(onDisabled.mock.calls[0][1]).toContain('timed out');
  });

  it('disables a plugin whose chunk fails to fetch', async () => {
    const onDisabled = vi.fn();
    const host = createEditorPluginHost(onDisabled, {
      declarations: [declaration()] as never,
      loaders: { fixture: () => Promise.reject(new Error('chunk 404')) },
    });
    const outcome = await host.run(host.bindings()[0], REQUEST);
    expect(outcome.status).toBe('failed');
    expect(onDisabled).toHaveBeenCalledExactlyOnceWith('fixture', 'chunk 404');
  });

  it('disables a plugin whose module exports no handler', async () => {
    const onDisabled = vi.fn();
    const host = createEditorPluginHost(onDisabled, {
      declarations: [declaration()] as never,
      loaders: { fixture: () => Promise.resolve({} as never) },
    });
    const outcome = await host.run(host.bindings()[0], REQUEST);
    expect(outcome.status).toBe('failed');
    expect(onDisabled).toHaveBeenCalledExactlyOnceWith('fixture', 'exports no handler');
  });

  it('reports a declaration the registry rejected', () => {
    const onDisabled = vi.fn();
    createEditorPluginHost(onDisabled, {
      declarations: [declaration({ bindings: [] })] as never,
      loaders: {},
    });
    expect(onDisabled).toHaveBeenCalledExactlyOnceWith('fixture', 'declares no bindings');
  });

  it('reports a binding that claims a chord the core editor already uses', () => {
    const onDisabled = vi.fn();
    const host = createEditorPluginHost(onDisabled, {
      declarations: [declaration({
        bindings: [{ command: 'save-it', chord: { key: 's', meta: true }, needs: 'selection' }],
      })] as never,
      loaders: {},
    });
    expect(onDisabled).toHaveBeenCalledOnce();
    expect(onDisabled.mock.calls[0][1]).toContain('a chord the editor already uses');
    expect(host.bindings()).toEqual([]);
  });

  it('leaves another plugin working when one is disabled', async () => {
    const { host, onDisabled } = setup(() => { throw new Error('bad'); }, [
      declaration(),
      declaration({
        id: 'other',
        bindings: [{ command: 'other-thing', chord: { key: 'k', meta: true }, needs: 'buffer' }],
      }),
    ]);
    await host.run(bindingOf(host), REQUEST);

    expect(onDisabled).toHaveBeenCalledExactlyOnceWith('fixture', 'bad');
    expect(host.bindings().map((binding) => binding.plugin)).toEqual(['other']);
    expect(host.disabled()).toEqual(['fixture']);
  });
});
