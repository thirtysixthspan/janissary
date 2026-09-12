import React from 'react';
import { act, render as renderBare, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../ws';
import { createPluginHost, PluginHostProvider, type PluginHost } from './host';
import { PluginBody } from './PluginBody';
import {
  clientPlugin,
  type ClientPluginLoader,
  type ClientPluginRegistration,
} from './registry';

// Each case owns its registry and its failure ledger, so a fixture plugin never has to be written
// into the production map and a disabled plugin cannot leak into the next case.
let registry: Map<string, ClientPluginRegistration>;
let host: PluginHost;

// Shadows Testing Library's `render` so every call site below gets the provider without saying so.
function render(ui: React.ReactElement) {
  return renderBare(ui, {
    wrapper: ({ children }) => <PluginHostProvider host={host}>{children}</PluginHostProvider>,
  });
}

function plugin(id = 'fixture', schemaVersion = 1): NonNullable<TabView['plugin']> {
  return { id, schemaVersion, payload: { valid: true } };
}

function client() {
  const send = vi.fn();
  const request = vi.fn();
  return { value: { send, request } as unknown as JanusClient, send };
}

function registration(loader: ClientPluginLoader): ClientPluginRegistration {
  return clientPlugin(1, loader);
}

const acceptsAnyPayload = (value: unknown): value is unknown => value !== undefined;

function body(id = 'fixture', label = id) {
  const fixture = client();
  const view = { plugin: plugin(id) };
  return {
    fixture,
    element: (
      <PluginBody
        plugin={view.plugin} label={label} client={fixture.value}
        active onClose={() => {}}
      />
    ),
  };
}

beforeEach(() => {
  registry = new Map();
  host = createPluginHost(registry);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PluginBody failure isolation', () => {
  it('renders a plugin body that mounts cleanly without reporting anything', async () => {
    registry.set('fixture', registration(async () => ({
      default: () => <div>fixture mounted</div>, isPayload: acceptsAnyPayload,
    })));
    const { fixture, element } = body();
    render(element);
    await waitFor(() => { expect(screen.getByText('fixture mounted')).toBeInTheDocument(); });
    expect(fixture.send).not.toHaveBeenCalled();
  });

  it('contains a render exception, reports it once, and keeps a sibling plugin rendering', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ThrowingPlugin = () => { throw new Error('render exploded'); };
    registry.set('bad', registration(async () => ({
      default: ThrowingPlugin, isPayload: acceptsAnyPayload,
    })));
    registry.set('good', registration(async () => ({
      default: () => <div>good plugin</div>, isPayload: acceptsAnyPayload,
    })));
    const bad = body('bad');
    const good = body('good');
    render(<>
      {bad.element}
      {good.element}
    </>);
    await waitFor(() => { expect(screen.getByText('good plugin')).toBeInTheDocument(); });
    await waitFor(() => {
      expect(bad.fixture.send).toHaveBeenCalledWith({
        method: 'pluginFailed', params: { tab: 'bad', reason: 'render exploded' },
      });
    });
    expect(bad.fixture.send).toHaveBeenCalledOnce();
    expect(good.fixture.send).not.toHaveBeenCalled();
    expect(screen.queryByText('render exploded')).not.toBeInTheDocument();
    expect(screen.getByText('good plugin')).toBeInTheDocument();
  });

  it('reports one activation timeout and drops the plugin when the import never resolves', async () => {
  // Each body arms its own deadline, so the mock hands out signals from a queue and the case
  // aborts only the first one — the fixture's — leaving the sibling's timer running.
  const controllers = [new AbortController(), new AbortController()];
  let armed = 0;
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => controllers[armed++]!.signal);
  registry.set('fixture', registration(() => new Promise(() => {})));
  registry.set('good', registration(async () => ({
    default: () => <div>good plugin</div>, isPayload: acceptsAnyPayload,
  })));
  const { fixture, element } = body();
  const good = body('good');
  render(<>
    {element}
    {good.element}
  </>);

  act(() => { controllers[0]!.abort(); });

    await waitFor(() => {
      expect(fixture.send).toHaveBeenCalledWith({
        method: 'pluginFailed',
        params: { tab: 'fixture', reason: 'client activation timed out after 5000 ms' },
      });
    });
    expect(fixture.send).toHaveBeenCalledOnce();
    expect(good.fixture.send).not.toHaveBeenCalled();
    await waitFor(() => { expect(screen.getByText('good plugin')).toBeInTheDocument(); });
    expect(screen.queryByText(/Loading fixture/)).not.toBeInTheDocument();
  });

  it('lets the deadline pass quietly once the plugin has mounted', async () => {
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    registry.set('fixture', registration(async () => ({
      default: () => <div>fixture mounted</div>, isPayload: acceptsAnyPayload,
    })));
    const { fixture, element } = body();
    render(element);
    await waitFor(() => { expect(screen.getByText('fixture mounted')).toBeInTheDocument(); });

    act(() => { controller.abort(); });

    expect(fixture.send).not.toHaveBeenCalled();
    expect(screen.getByText('fixture mounted')).toBeInTheDocument();
  });

  it('reports an unknown plugin id once through the pre-mount failure effect', async () => {
    const { fixture, element } = body('unknown');
    const rendered = render(element);
    await waitFor(() => {
      expect(fixture.send).toHaveBeenCalledWith({
        method: 'pluginFailed',
        params: { tab: 'unknown', reason: 'unknown client plugin "unknown"' },
      });
    });

    rendered.rerender(element);

    expect(fixture.send).toHaveBeenCalledOnce();
  });

  it('reports a schema mismatch once and never invokes the loader', async () => {
    const load = vi.fn(async () => ({ default: () => <div />, isPayload: acceptsAnyPayload }));
    registry.set('fixture', registration(load));
    const fixture = client();
    const mismatched = { plugin: plugin('fixture', 2) };
    const element = (
      <PluginBody
        plugin={mismatched.plugin} label="fixture" client={fixture.value}
        active onClose={() => {}}
      />
    );
    const rendered = render(element);
    await waitFor(() => { expect(fixture.send).toHaveBeenCalledOnce(); });
    expect(fixture.send).toHaveBeenCalledWith({
      method: 'pluginFailed',
      params: { tab: 'fixture', reason: 'payload schema 2 is not supported; expected 1' },
    });

    rendered.rerender(element);

    expect(fixture.send).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
  });

  it('throws when no PluginHostProvider sits above the body', () => {
    registry.set('fixture', registration(async () => ({
      default: () => <div>fixture mounted</div>, isPayload: acceptsAnyPayload,
    })));
    const { value } = client();
    expect(() => {
      renderBare(
        <PluginBody
          plugin={plugin()} label="fixture" client={value}
          active onClose={() => {}}
        />,
      );
    }).toThrow('no PluginHostProvider above this plugin');
  });
});
