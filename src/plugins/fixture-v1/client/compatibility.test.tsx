import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TabView } from '../../../protocol';
import { fixtureV1Manifest } from '../manifest';
import { activate } from './activate';

// The fixture is not in the production catalog, so it is registered into the real client host for
// the duration of this file. Everything else — the lazy wrapper, the API and schema checks, payload
// validation on render, the capability object — is the shipping code path, which is the point: a
// contract break has to fail here rather than in a hand-built harness that mirrors it.
const loader = vi.hoisted(() => vi.fn());
vi.mock('../../manifests', async () => {
  const manifest = await import('../manifest');
  return { pluginManifests: [manifest.fixtureV1Manifest] };
});
vi.mock('../../client/loaders', () => ({ clientPluginLoaders: { 'fixture-v1': loader } }));

import { PluginTabLayer } from '../../client/PluginTabLayer';
import { resetClientPluginFailures } from '../../client/registry';

const payload = { message: 'fixture v1', resource: '/open/1' };

function tab(overrides: Partial<TabView['plugin']> = {}): TabView {
  return {
    label: 'fixture', view: 'plugin',
    plugin: { pluginId: 'fixture-v1', schemaVersion: fixtureV1Manifest.payloadSchemaVersion, payload, ...overrides },
  } as TabView;
}

function client() {
  const send = vi.fn();
  const request = vi.fn(async () => ({ schemaVersion: 1, payload: { message: 'round trip' } }));
  return { value: { send, request } as never, send, request };
}

beforeEach(() => {
  resetClientPluginFailures();
  loader.mockResolvedValue({ activate });
});

describe('frozen tab plugin API v1 client fixture', () => {
  it('activates, validates, and renders the representative v1 payload through the host layer', async () => {
    const { value, send } = client();

    render(<PluginTabLayer tab={tab()} client={value} />);

    await waitFor(() => {
      expect(screen.getByText('fixture v1')).toHaveAttribute('data-plugin-fixture', 'v1');
    });
    expect(send).not.toHaveBeenCalled();
  });

  // The intent round trip is frozen on the server side, where a real reply crosses the boundary.
  // What this side owes the contract is the activation shape the host checks before mounting.
  it('returns an activation the host accepts for this manifest', async () => {
    const fixture = await activate();

    expect(fixture.apiVersion).toEqual(fixtureV1Manifest.requiredApiVersion);
    expect(fixture.payloadSchemaVersion).toBe(fixtureV1Manifest.payloadSchemaVersion);
    expect(fixture.validateTabPayload(payload)).toBe(true);
    expect(fixture.validateTabPayload({ message: 'no resource' })).toBe(false);
  });

  it('reports one host failure when the frozen payload no longer validates', async () => {
    const { value, send } = client();

    render(<PluginTabLayer tab={tab({ payload: { message: 42 } })} client={value} />);

    await waitFor(() => { expect(send).toHaveBeenCalledOnce(); });
    expect(send.mock.calls[0][0]).toMatchObject({
      method: 'pluginIntent',
      params: { tab: 'fixture', intent: '$host/client-failure' },
    });
  });
});
