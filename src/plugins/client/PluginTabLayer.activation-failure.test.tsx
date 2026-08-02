import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { TabView } from '../../protocol';

const loader = vi.hoisted(() => vi.fn(async () => ({
  activate: async () => ({
    apiVersion: { major: 2, minor: 0 },
    payloadSchemaVersion: 1,
    validateTabPayload: () => true,
    component: () => null,
  }),
})));
vi.mock('./loaders', () => ({ clientPluginLoaders: { video: loader } }));

import { PluginTabLayer } from './PluginTabLayer';

afterEach(() => { vi.restoreAllMocks(); });

it('contains an incompatible client activation and reports it once', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const send = vi.fn();
  const tab = {
    label: 'video-tab', view: 'plugin',
    plugin: { pluginId: 'video', schemaVersion: 1, payload: {} },
    dotColor: '#ff0', groupColor: '#ccc',
  } as TabView;

  render(<PluginTabLayer tab={tab} client={{ send, request: vi.fn() } as never} />);

  expect(await screen.findByText(
    'Tab plugin "video" disabled: client activation returned an incompatible API version.',
  )).toBeInTheDocument();
  await waitFor(() => { expect(send).toHaveBeenCalledOnce(); });
  expect(loader).toHaveBeenCalledOnce();
});
