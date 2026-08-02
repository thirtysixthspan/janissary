import React, { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '../../protocol';
import { TAB_PLUGIN_API_VERSION, type TabPluginClientComponentProperties } from '../api';

const loader = vi.hoisted(() => vi.fn());
vi.mock('./loaders', () => ({ clientPluginLoaders: { video: loader } }));

import { PluginTabLayer } from './PluginTabLayer';
import { clientPluginIds, resetClientPluginFailures } from './registry';

let mountCount = 0;

function TestPlugin({ payload }: TabPluginClientComponentProperties) {
  useEffect(() => { mountCount += 1; }, []);
  const value = payload as { message: string; renderError?: boolean };
  if (value.renderError) throw new Error('render exploded');
  return <div data-testid="test-plugin">{value.message}</div>;
}

function isPayload(value: unknown): boolean {
  return typeof value === 'object' && value !== null && typeof (value as { message?: unknown }).message === 'string';
}

function tab(payload: unknown, pluginId = 'video'): TabView {
  return {
    label: `${pluginId}-tab`, view: 'plugin', plugin: { pluginId, schemaVersion: 1, payload },
    dotColor: '#ff0', groupColor: '#ccc',
  } as TabView;
}

function client() {
  const send = vi.fn();
  const request = vi.fn(async () => ({ schemaVersion: 1, payload: {} }));
  return { value: { send, request } as never, send, request };
}

beforeEach(() => {
  resetClientPluginFailures();
  loader.mockResolvedValue({
    activate: async () => ({
      apiVersion: TAB_PLUGIN_API_VERSION,
      payloadSchemaVersion: 1,
      validateTabPayload: isPayload,
      component: TestPlugin,
    }),
  });
});

describe('PluginTabLayer', () => {
  it('keeps behavior unloaded until a plugin tab exists and shows a loading fallback', async () => {
    expect(loader).not.toHaveBeenCalled();
    expect(clientPluginIds()).toEqual(['video']);
    const { value } = client();

    render(<PluginTabLayer tab={tab({ message: 'ready' })} client={value} />);

    expect(screen.getByText('Loading tab plugin…')).toBeInTheDocument();
    expect(await screen.findByText('ready')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledOnce();
  });

  it('keeps one mounted component while its payload and host actions change', async () => {
    mountCount = 0;
    const first = tab({ message: 'first' });
    const { value } = client();
    const { rerender } = render(<PluginTabLayer tab={first} client={value} />);
    expect(await screen.findByText('first')).toBeInTheDocument();

    rerender(<PluginTabLayer tab={{ ...first, plugin: { ...first.plugin!, payload: { message: 'second' } } }} client={value} />);

    expect(screen.getByText('second')).toBeInTheDocument();
    expect(mountCount).toBe(1);
  });

  it('contains an invalid plugin payload and reports one host failure', async () => {
    const { value, send } = client();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<PluginTabLayer tab={tab({ invalid: true })} client={value} />);

    expect(await screen.findByText('Tab plugin "video" disabled: plugin tab payload is invalid.')).toBeInTheDocument();
    await waitFor(() => { expect(send).toHaveBeenCalledOnce(); });
    expect(send).toHaveBeenCalledWith({
      method: 'pluginIntent',
      params: {
        tab: 'video-tab', schemaVersion: 1, intent: '$host/client-failure',
        payload: { reason: 'plugin tab payload is invalid' },
      },
    });
    vi.restoreAllMocks();
  });

  it('contains render exceptions without affecting a sibling host view', async () => {
    const { value, send } = client();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<><button type="button">Host remains usable</button><PluginTabLayer
      tab={tab({ message: 'bad', renderError: true })} client={value}
    /></>);

    expect(await screen.findByText('Tab plugin "video" disabled: render exploded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Host remains usable' })).toBeEnabled();
    await waitFor(() => { expect(send).toHaveBeenCalledOnce(); });
    vi.restoreAllMocks();
  });

  it('contains unknown plugins without invoking any behavior loader', async () => {
    const before = loader.mock.calls.length;
    const { value, send } = client();

    render(<PluginTabLayer tab={tab({}, 'missing')} client={value} />);

    expect(screen.getByText('Tab plugin "missing" disabled: plugin is not registered by this client.')).toBeInTheDocument();
    await waitFor(() => { expect(send).toHaveBeenCalledOnce(); });
    expect(loader).toHaveBeenCalledTimes(before);
  });

  it('rejects a mismatched wire schema before rendering plugin behavior', async () => {
    const before = loader.mock.calls.length;
    const value = tab({ message: 'wrong schema' });
    value.plugin = { ...value.plugin!, schemaVersion: 2 };
    const setup = client();

    render(<PluginTabLayer tab={value} client={setup.value} />);

    expect(screen.getByText(
      'Tab plugin "video" disabled: plugin tab payload schema version is incompatible.',
    )).toBeInTheDocument();
    await waitFor(() => { expect(setup.send).toHaveBeenCalledOnce(); });
    expect(loader).toHaveBeenCalledTimes(before);
  });
});
