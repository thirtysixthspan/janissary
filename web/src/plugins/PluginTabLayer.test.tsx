import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { PluginTabLayer } from './PluginTabLayer';
import {
  clearClientPluginFailures,
  clientPlugin,
  clientPluginRegistry,
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
  return clientPlugin(1, loader);
}

// The entry guard these cases are not exercising. A real one narrows to its plugin's payload type;
// this one accepts every payload the host would actually hand it, so a test about chunk loading or
// rendering fails for its own reason rather than for a payload the fixture never cared about.
const acceptsAnyPayload = (value: unknown): value is unknown => value !== undefined;

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
      isPayload: acceptsAnyPayload,
    });
    await waitFor(() => { expect(screen.getByText('fixture mounted')).toBeInTheDocument(); });
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('reports a schema mismatch once and never invokes the loader', async () => {
    const load = vi.fn(async () => ({ default: () => <div />, isPayload: acceptsAnyPayload }));
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
      default: ThrowingPlugin, isPayload: acceptsAnyPayload,
    })));
    const fixture = client();
    render(<PluginTabLayer {...properties(tab(), fixture.value)} />);
    await waitFor(() => { expect(fixture.send).toHaveBeenCalledOnce(); });
    expect(fixture.send).toHaveBeenCalledWith({
      method: 'pluginFailed', params: { tab: 'fixture', reason: 'render exploded' },
    });
  });

  // The entry guard is the last thing between a host-produced payload and plugin code that will
  // index straight into it. A schema version can match while the payload behind it is still wrong —
  // a plugin bug, or a manifest whose version was never bumped — so this path has to contain rather
  // than let the component throw somewhere less specific.
  it('contains a payload the entry guard rejects, without rendering the component', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Plugin = vi.fn(() => <div>never rendered</div>);
    registry.set('fixture', registration(async () => ({
      default: Plugin, isPayload: (value): value is unknown => value === 'expected',
    })));
    const fixture = client();
    const view = tab();
    const rendered = render(<PluginTabLayer {...properties(view, fixture.value)} />);

    await waitFor(() => { expect(fixture.send).toHaveBeenCalledOnce(); });
    expect(fixture.send).toHaveBeenCalledWith({
      method: 'pluginFailed', params: { tab: 'fixture', reason: 'invalid plugin payload' },
    });
    expect(Plugin).not.toHaveBeenCalled();
    rendered.rerender(<PluginTabLayer {...properties(view, fixture.value)} />);
    expect(fixture.send).toHaveBeenCalledOnce();
  });

  it('renders without a split action when the host offers no split', async () => {
    registry.set('fixture', registration(async () => ({
      default: ({ capabilities }) => <div>split:{String(capabilities.splitAction)}</div>,
      isPayload: acceptsAnyPayload,
    })));
    const fixture = client();
    render(<PluginTabLayer {...properties(tab(), fixture.value)} onSplit={undefined} />);
    await waitFor(() => { expect(screen.getByText('split:null')).toBeInTheDocument(); });
    expect(fixture.send).not.toHaveBeenCalled();
  });

  // A hidden plugin tab stays mounted, so the layer is what tells its body whether it is the tab
  // the user is looking at.
  it('reports the tab as active only while it is the current one', async () => {
    registry.set('fixture', registration(async () => ({
      default: ({ capabilities }) => <div>active:{String(capabilities.active)}</div>,
      isPayload: acceptsAnyPayload,
    })));
    const fixture = client();
    const view = tab();
    const rendered = render(<PluginTabLayer {...properties(view, fixture.value)} />);
    await waitFor(() => { expect(screen.getByText('active:true')).toBeInTheDocument(); });

    rendered.rerender(
      <PluginTabLayer
        {...properties(view, fixture.value, false)} current={tab('fixture', 1, 'other')}
      />,
    );

    expect(screen.getByText('active:false')).toBeInTheDocument();
  });

  // The plugin renders the node but never owns the handler, and the layer rebuilds `onSplit` on
  // every render — so the split must reach the current handler without the capability object
  // changing identity underneath a mounted plugin.
  it('hands through a split action that calls the host\'s current handler', async () => {
    registry.set('fixture', registration(async () => ({
      default: ({ capabilities }) => <div data-testid="body">{capabilities.splitAction}</div>,
      isPayload: acceptsAnyPayload,
    })));
    const fixture = client();
    const view = tab();
    const first = vi.fn();
    const second = vi.fn();
    const rendered = render(
      <PluginTabLayer {...properties(view, fixture.value)} onSplit={first} />,
    );
    await waitFor(() => { expect(screen.getByTitle('Split')).toBeInTheDocument(); });

    rendered.rerender(<PluginTabLayer {...properties(view, fixture.value)} onSplit={second} />);
    fireEvent.click(screen.getByTitle('Split'));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  // The deadline covers the chunk and the first mount together, so a plugin that mounted in time
  // must not be disabled when the timer it shared with the chunk import finally fires.
  it('lets the shared deadline pass quietly once the plugin has mounted', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    registry.set('fixture', registration(async () => ({
      default: () => <div>fixture mounted</div>, isPayload: acceptsAnyPayload,
    })));
    const fixture = client();
    render(<PluginTabLayer {...properties(tab(), fixture.value)} />);
    await waitFor(() => { expect(screen.getByText('fixture mounted')).toBeInTheDocument(); });

    act(() => { controller.abort(); });

    expect(fixture.send).not.toHaveBeenCalled();
    expect(screen.getByText('fixture mounted')).toBeInTheDocument();
  });

  // The layer still owns the frame for a tab whose envelope has not arrived: the element and its
  // border stay put so nothing in the split grid reflows, and no plugin is blamed for the gap.
  it('renders the host frame and nothing else for a tab with no envelope', () => {
    const fixture = client();
    const view: TabView = { ...tab(), plugin: undefined };
    const { container } = render(<PluginTabLayer {...properties(view, fixture.value)} />);

    const body = container.querySelector('.tab-body');
    expect(body).toBeInTheDocument();
    expect(body).toBeEmptyDOMElement();
    expect(fixture.send).not.toHaveBeenCalled();
  });

  // A payload the server replaced arrives on an ordinary state broadcast, so the body has to take it
  // as a re-render. Remounting instead would throw away exactly what the persistent mount protects:
  // a video's playback position, a document's scroll offset.
  it('renders a replaced payload without remounting the plugin', async () => {
    const mounts = vi.fn();
    const Plugin = ({ payload }: { payload: unknown }) => {
      React.useEffect(() => { mounts(); }, []);
      return <div>{(payload as { text: string }).text}</div>;
    };
    registry.set('fixture', clientPlugin(
      1,
      async () => ({ default: Plugin, isPayload: acceptsAnyPayload }),
    ));
    const fixture = client();
    const first = tab();
    first.plugin!.payload = { text: 'before' };
    const { rerender } = render(<PluginTabLayer {...properties(first, fixture.value)} />);
    await waitFor(() => { expect(screen.getByText('before')).toBeInTheDocument(); });

    const second = tab();
    second.plugin!.payload = { text: 'after' };
    rerender(<PluginTabLayer {...properties(second, fixture.value)} />);

    await waitFor(() => { expect(screen.getByText('after')).toBeInTheDocument(); });
    expect(mounts).toHaveBeenCalledOnce();
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('isolates one failed plugin from another plugin layer', async () => {
    const GoodPlugin = () => <div>good plugin</div>;
    registry.set('good', clientPlugin(
      1,
      async () => ({ default: GoodPlugin, isPayload: acceptsAnyPayload }),
    ));
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
