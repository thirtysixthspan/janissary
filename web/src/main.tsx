import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './theme.css';
import { App } from './App';
import { startClientPageLifecycle } from './client-page-lifecycle';
import { createPluginHost, PluginHostProvider } from './plugins/host';
import { JanusClient } from './ws';

const root = createRoot(document.querySelector('#root')!);

// Built once for the page rather than per connection: a plugin disabled by a failure stays disabled
// until a reload, and rebuilding the host on a reconnect would quietly forget that.
const pluginHost = createPluginHost();

startClientPageLifecycle(
  () => new JanusClient(),
  (client) => root.render(
    <React.StrictMode>
      <PluginHostProvider host={pluginHost}>
        <App client={client} />
      </PluginHostProvider>
    </React.StrictMode>,
  ),
);
