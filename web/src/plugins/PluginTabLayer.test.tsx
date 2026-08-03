import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { PluginTabLayer } from './PluginTabLayer';
import {
  clearClientPluginFailures,
  clientPluginRegistry,
  createClientPluginRegistry,
  type ClientPluginLoader,
  type ClientPluginRegistration,
} from './registry';

const registry = clientPluginRegistry as Map<string, ClientPluginRegistration>;
const productionEntries = [...registry];

function tab(id = 'fixture', schemaVersion = 1, label = id): TabView {
  return {
    label, number: 1, dotColor: '#123', group: 1, groupColor: '#fff', busy: false,
    hasUnread: false, cwd: '/', connections: [], schedule: [], bufferLines: [], cmdHistory: [],
    commandQueue: [], toolStepsExpanded: false, view: 'plugin',
    plugin: { id, schemaVersion, payload: { valid: true } },
  };
}

function client() {
  const send = vi.fn();
  const request = vi.fn();
  return { value: { send, request } as unknown as JanusClient, send };
}

function registration(loader: ClientPluginLoader): ClientPluginRegistration {
  return createClientPluginRegistry({ fixture: { schemaVersion: 1, loader } }).get('fixture')!;
}

function properties(view: TabView, value: JanusClient, visible = true) {
  return { tab: view, index: 2, current: view, visible, client: value };
}

beforeEach(() => {
  registry.clear();
  clearClientPluginFailures();
});

afterEach(() => {
  registry.clear();
  for (const [id, entry] of productionEntries) registry.set(id, entry);
  clearClientPluginFailures();
  vi.restoreAllMocks();
});

describe('PluginTabLayer lazy lifecycle', () => {
  it('renders a loading fallback until the chunk mounts', async () => {
    let release!: (module: Awaited<ReturnType<ClientPluginLoader>>) => void;
    // eslint-disable-next-line unicorn/prefer-promise-with-resolvers -- the web target excludes ES2024.
    const pending = new Promise<Awaited<ReturnType<ClientPluginLoader>>>((resolve) => { release = resolve; });
    registry.set('fixture', registration(() => pending));
    const fixture = client();
    render(<PluginTabLayer {...properties(tab(), fixture.value)} />);
    expect(screen.getByText('Loading fixture…')).toBeInTheDocument();

    release({
      default: () => <div>fixture mounted</div>,
      isPayload: () => true,
    });
    await waitFor(() => { expect(screen.getByText('fixture mounted')).toBeInTheDocument(); });
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('reports a schema mismatch once and never invokes the loader', async () => {
    const load = vi.fn(async () => ({ default: () => <div />, isPayload: () => true }));
    registry.set('fixture', registration(load));
    const fixture = client();
    const view = tab('fixture', 2);
    const rendered = render(<PluginTabLayer {...properties(view, fixture.value)} />);
    await waitFor(() => { expect(fixture.send).toHaveBeenCalledOnce(); });
    expect(fixture.send).toHaveBeenCalledWith({
      method: 'pluginFailed',
      params: { tab: 'fixture', reason: 'payload schema 2 is not supported; expected 1' },
    });
    rendered.rerender(<PluginTabLayer {...properties(view, fixture.value)} />);
    expect(fixture.send).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
  });

  it('reports an unknown plugin id once', async () => {
    const fixture = client();
    const view = tab('unknown');
    const rendered = render(<PluginTabLayer {...properties(view, fixture.value)} />);
    await waitFor(() => { expect(fixture.send).toHaveBeenCalledOnce(); });
    expect(fixture.send).toHaveBeenCalledWith({
      method: 'pluginFailed', params: { tab: 'unknown', reason: 'unknown client plugin "unknown"' },
    });
    rendered.rerender(<PluginTabLayer {...properties(view, fixture.value)} />);
    expect(fixture.send).toHaveBeenCalledOnce();
  });

  it('caches a rejected chunk and does not retry it on rerender', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const load = vi.fn(async () => { throw new Error('chunk rejected'); });
    registry.set('fixture', registration(load));
    const fixture = client();
    const view = tab();
    const rendered = render(<PluginTabLayer {...properties(view, fixture.value)} />);
    await waitFor(() => { expect(fixture.send).toHaveBeenCalledOnce(); });
    rendered.rerender(<PluginTabLayer {...properties(view, fixture.value)} />);
    expect(load).toHaveBeenCalledOnce();
    expect(fixture.send).toHaveBeenCalledWith({
      method: 'pluginFailed', params: { tab: 'fixture', reason: 'chunk rejected' },
    });
  });

  it('reports a shared chunk-and-mount deadline once', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    registry.set('fixture', registration(() => new Promise(() => {})));
    const fixture = client();
    render(<PluginTabLayer {...properties(tab(), fixture.value)} />);

    act(() => { controller.abort(); });

    await waitFor(() => { expect(fixture.send).toHaveBeenCalledOnce(); });
    expect(AbortSignal.timeout).toHaveBeenCalledWith(5000);
    expect(fixture.send).toHaveBeenCalledWith({
      method: 'pluginFailed',
      params: { tab: 'fixture', reason: 'client activation timed out after 5000 ms' },
    });
  });

  it('contains a render exception and reports it once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ThrowingPlugin = () => { throw new Error('render exploded'); };
    registry.set('fixture', registration(async () => ({
      default: ThrowingPlugin, isPayload: () => true,
    })));
    const fixture = client();
    render(<PluginTabLayer {...properties(tab(), fixture.value)} />);
    await waitFor(() => { expect(fixture.send).toHaveBeenCalledOnce(); });
    expect(fixture.send).toHaveBeenCalledWith({
      method: 'pluginFailed', params: { tab: 'fixture', reason: 'render exploded' },
    });
  });

  it('isolates one failed plugin from another plugin layer', async () => {
    const GoodPlugin = () => <div>good plugin</div>;
    registry.set('good', createClientPluginRegistry({
      good: {
        schemaVersion: 1,
        loader: async () => ({ default: GoodPlugin, isPayload: () => true }),
      },
    }).get('good')!);
    const fixture = client();
    const bad = tab('bad');
    const good = tab('good');
    render(<>
      <PluginTabLayer {...properties(bad, fixture.value)} />
      <PluginTabLayer {...properties(good, fixture.value)} />
    </>);
    await waitFor(() => { expect(screen.getByText('good plugin')).toBeInTheDocument(); });
    expect(fixture.send).toHaveBeenCalledOnce();
    expect(fixture.send).toHaveBeenCalledWith(expect.objectContaining({
      params: { tab: 'bad', reason: 'unknown client plugin "bad"' },
    }));
  });
});
