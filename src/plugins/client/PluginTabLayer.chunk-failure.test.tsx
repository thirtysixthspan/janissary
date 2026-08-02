import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { TabView } from '../../protocol';

const loader = vi.hoisted(() => vi.fn(async () => { throw new Error('chunk blocked'); }));
vi.mock('./loaders', () => ({ clientPluginLoaders: { video: loader } }));

import { PluginTabLayer } from './PluginTabLayer';

function tab(label: string): TabView {
  return {
    label, view: 'plugin', plugin: { pluginId: 'video', schemaVersion: 1, payload: {} },
    dotColor: '#ff0', groupColor: '#ccc',
  } as TabView;
}

it('records a rejected chunk once and does not retry it for later tabs', async () => {
  const send = vi.fn();
  const client = { send, request: vi.fn() } as never;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const first = render(<><button type="button">Other tab</button><PluginTabLayer tab={tab('first')} client={client} /></>);

  expect(await screen.findByText('Tab plugin "video" disabled: chunk blocked.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Other tab' })).toBeEnabled();
  await waitFor(() => { expect(send).toHaveBeenCalledOnce(); });
  first.unmount();

  render(<PluginTabLayer tab={tab('second')} client={client} />);
  expect(screen.getByText('Tab plugin "video" disabled: chunk blocked.')).toBeInTheDocument();
  expect(loader).toHaveBeenCalledOnce();
  expect(send).toHaveBeenCalledOnce();
  vi.restoreAllMocks();
});
