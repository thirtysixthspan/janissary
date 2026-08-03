import React, { Suspense } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FIXTURE_PAYLOAD_SCHEMA_VERSION } from '@shared/plugins/fixture-v1/shared';
import type { TabPluginClientCapabilities } from '../api';
import {
  clientPlugin,
  clientPluginLoaders,
  clientPluginRegistry,
  createClientPluginRegistry,
} from '../registry';
import FixtureV1, { isPayload } from './index';

const payload = { text: 'fixture round trip', resource: '/open/fixture-1' };

function capabilities(): TabPluginClientCapabilities {
  return {
    resourceUrl: (reference) => `${reference}?token=test`,
    intent: async <Result,>() => ({ echoed: 'fixture round trip' }) as Result,
    splitAction: null,
    active: true,
    reportFailure: vi.fn(),
  };
}

describe('frozen client tab plugin API v1 fixture', () => {
  it('pins production loader parity without registering the fixture', () => {
    expect(Object.keys(clientPluginLoaders).toSorted((a, b) => a.localeCompare(b))).toEqual(
      [...clientPluginRegistry.keys()].toSorted((a, b) => a.localeCompare(b)),
    );
    expect(clientPluginRegistry.has('fixture-v1')).toBe(false);
  });

  it('validates and renders the frozen payload through narrow capabilities', () => {
    expect(isPayload(payload)).toBe(true);
    expect(isPayload({ text: 'missing resource' })).toBe(false);
    const { container } = render(
      <FixtureV1 payload={payload} capabilities={capabilities()} />,
    );
    expect(screen.getByText('fixture round trip')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute(
      'data-resource', '/open/fixture-1?token=test',
    );
  });

  it('loads the fixture through the same stable lazy wrapper contract', async () => {
    const mounted = vi.fn();
    const registry = createClientPluginRegistry({
      'fixture-v1': clientPlugin(FIXTURE_PAYLOAD_SCHEMA_VERSION, () => import('./index')),
    });
    const Component = registry.get('fixture-v1')!.Component;
    render(
      <Suspense fallback={<div>loading</div>}>
        <Component payload={payload} capabilities={capabilities()} onMounted={mounted} />
      </Suspense>,
    );
    await waitFor(() => { expect(screen.getByText('fixture round trip')).toBeInTheDocument(); });
    expect(mounted).toHaveBeenCalledOnce();
  });
});
