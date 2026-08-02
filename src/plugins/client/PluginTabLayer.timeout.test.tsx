import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { TabView } from '../../protocol';

const loader = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
vi.mock('./loaders', () => ({ clientPluginLoaders: { video: loader } }));

import { PluginTabLayer } from './PluginTabLayer';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('disables a client plugin whose chunk does not load before the deadline', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const send = vi.fn();
  const tab = {
    label: 'video-tab', view: 'plugin',
    plugin: { pluginId: 'video', schemaVersion: 1, payload: {} },
    dotColor: '#ff0', groupColor: '#ccc',
  } as TabView;
  render(<PluginTabLayer tab={tab} client={{ send, request: vi.fn() } as never} />);
  expect(screen.getByText('Loading tab plugin…')).toBeInTheDocument();

  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

  expect(screen.getByText('Tab plugin "video" disabled: client activation timed out after 5000 ms.')).toBeInTheDocument();
  expect(send).toHaveBeenCalledOnce();
  expect(loader).toHaveBeenCalledOnce();
});
