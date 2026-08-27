import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { JanusClient } from '../../ws';
import type { KeyLike } from '../keys';
import type { EditorState } from '../model';
import type { EditorApi } from '../useEditor';
import type { BoundBinding, EditorPluginRequest, EditorPluginResult } from './api';
import type { EditorPluginHost, RunOutcome } from './host';
import { useEditorPlugins, type PluginReport } from './useEditorPlugins';

const CHORD: KeyLike = { key: '/', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };

function binding(needs: 'selection' | 'buffer' = 'selection'): BoundBinding {
  return { plugin: 'commenting', command: 'toggle-comment', chord: { key: '/', meta: true }, needs };
}

function makeState(
  text: string, cursor?: EditorState['cursor'], anchor: EditorState['anchor'] = null,
): EditorState {
  return { lines: text.split('\n'), cursor: cursor ?? { line: 0, col: 0 }, anchor };
}

function makeApi(state: EditorState) {
  const replace = vi.fn();
  const api = { stateRef: { current: state }, replace } as unknown as EditorApi;
  return { api, replace };
}

function makeHost(outcome: RunOutcome, bound = binding()) {
  const run = vi.fn(
    (_binding: BoundBinding, _request: EditorPluginRequest) => Promise.resolve(outcome),
  );
  const disable = vi.fn();
  const host: EditorPluginHost = { bindings: () => [bound], run, disable, disabled: () => [] };
  return { host, run, disable };
}

function makeClient() {
  const send = vi.fn();
  return { client: { send } as unknown as JanusClient, send };
}

const ok = (result: EditorPluginResult | null): RunOutcome => ({ status: 'ok', result });

// Renders the hook and returns its keydown handler.
function mount(
  state: EditorState, host: EditorPluginHost, client: JanusClient, api: EditorApi,
  file = 'a.ts', reports: PluginReport[] = [],
) {
  const { result } = renderHook(() => useEditorPlugins(client, '/open/1', api, file, host, reports));
  return result.current;
}

const flush = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('useEditorPlugins', () => {
  it('reports no match for a chord no binding claims', () => {
    const state = makeState('a();');
    const { api } = makeApi(state);
    const { host, run } = makeHost(ok(null));
    const handle = mount(state, host, makeClient().client, api);

    expect(handle({ ...CHORD, key: 'j' })).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('passes the caret\'s line when a selection binding fires with nothing selected', async () => {
    const state = makeState('one\ntwo\nthree', { line: 1, col: 2 });
    const { api } = makeApi(state);
    const { host, run } = makeHost(ok(null));
    const handle = mount(state, host, makeClient().client, api);

    expect(handle(CHORD)).toBe(true);
    await flush();

    const request = run.mock.calls[0][1];
    expect(request.lines).toEqual(['two']);
    expect(request.range).toEqual({ start: { line: 1, col: 0 }, end: { line: 1, col: 3 } });
    expect(request.selection).toEqual({ anchor: null, cursor: { line: 1, col: 2 } });
    expect(request.file).toBe('a.ts');
    expect(request.command).toBe('toggle-comment');
  });

  it('passes the whole lines a selection covers, and no more', async () => {
    const state = makeState('one\ntwo\nthree\nfour', { line: 2, col: 1 }, { line: 1, col: 2 });
    const { api } = makeApi(state);
    const { host, run } = makeHost(ok(null));
    const handle = mount(state, host, makeClient().client, api);

    handle(CHORD);
    await flush();

    const request = run.mock.calls[0][1];
    expect(request.lines).toEqual(['two', 'three']);
    expect(request.range).toEqual({ start: { line: 1, col: 0 }, end: { line: 2, col: 5 } });
  });

  it('passes the whole document to a buffer binding', async () => {
    const state = makeState('one\ntwo', { line: 1, col: 0 });
    const { api } = makeApi(state);
    const { host, run } = makeHost(ok(null), binding('buffer'));
    const handle = mount(state, host, makeClient().client, api);

    handle(CHORD);
    await flush();

    const request = run.mock.calls[0][1];
    expect(request.lines).toEqual(['one', 'two']);
    expect(request.range).toEqual({ start: { line: 0, col: 0 }, end: { line: 1, col: 3 } });
  });

  it('changes nothing on a null result', async () => {
    const state = makeState('one');
    const { api, replace } = makeApi(state);
    const { host } = makeHost(ok(null));
    const handle = mount(state, host, makeClient().client, api);

    handle(CHORD);
    await flush();
    expect(replace).not.toHaveBeenCalled();
  });

  it('applies a sound result as exactly one undo step', async () => {
    const state = makeState('one');
    const { api, replace } = makeApi(state);
    const { host } = makeHost(ok({
      edits: [{ start: { line: 0, col: 0 }, end: { line: 0, col: 0 }, text: '// ' }],
    }));
    const handle = mount(state, host, makeClient().client, api);

    handle(CHORD);
    await flush();

    expect(replace).toHaveBeenCalledOnce();
    expect((replace.mock.calls[0][0] as EditorState).lines).toEqual(['// one']);
  });

  it('changes nothing and disables the plugin on an unsound result', async () => {
    const state = makeState('one');
    const { api, replace } = makeApi(state);
    const { host, disable } = makeHost(ok({
      edits: [{ start: { line: 9, col: 0 }, end: { line: 9, col: 0 }, text: 'x' }],
    }));
    const { client, send } = makeClient();
    const handle = mount(state, host, client, api);

    handle(CHORD);
    await flush();

    expect(replace).not.toHaveBeenCalled();
    expect(disable).toHaveBeenCalledOnce();
    expect(disable.mock.calls[0][0]).toBe('commenting');
    expect(send).not.toHaveBeenCalled();
  });

  it('changes nothing when the run itself failed', async () => {
    const state = makeState('one');
    const { api, replace } = makeApi(state);
    const { host } = makeHost({ status: 'failed', reason: 'broke' });
    const handle = mount(state, host, makeClient().client, api);

    handle(CHORD);
    await flush();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('useEditorPlugins — reporting a disabled plugin', () => {
  it('sends a queued report on mount and drains the queue', () => {
    const state = makeState('one');
    const { api } = makeApi(state);
    const { host } = makeHost(ok(null));
    const { client, send } = makeClient();
    const reports: PluginReport[] = [{ plugin: 'commenting', reason: 'exports no handler' }];

    mount(state, host, client, api, 'a.ts', reports);

    expect(send).toHaveBeenCalledExactlyOnceWith({
      method: 'editorPluginFailed',
      params: { url: '/open/1', plugin: 'commenting', reason: 'exports no handler' },
    });
    expect(reports).toEqual([]);
  });

  it('sends a report queued while the run was in flight', async () => {
    const state = makeState('one');
    const { api } = makeApi(state);
    const reports: PluginReport[] = [];
    const { host } = makeHost({ status: 'failed', reason: 'broke' });
    // The real host enqueues through its onDisabled callback as it fails the run.
    const failing: EditorPluginHost = {
      ...host,
      run: async (...args) => {
        reports.push({ plugin: 'commenting', reason: 'broke' });
        return host.run(...args);
      },
    };
    const { client, send } = makeClient();

    const handle = mount(state, failing, client, api, 'a.ts', reports);
    send.mockClear();
    handle(CHORD);
    await flush();

    expect(send).toHaveBeenCalledExactlyOnceWith({
      method: 'editorPluginFailed',
      params: { url: '/open/1', plugin: 'commenting', reason: 'broke' },
    });
  });

  it('sends nothing when no plugin has been disabled', () => {
    const state = makeState('one');
    const { api } = makeApi(state);
    const { host } = makeHost(ok(null));
    const { client, send } = makeClient();

    mount(state, host, client, api, 'a.ts', []);
    expect(send).not.toHaveBeenCalled();
  });
});
