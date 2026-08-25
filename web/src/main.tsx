import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './theme.css';
import { App } from './App';
import { startClientPageLifecycle } from './client-page-lifecycle';
import { JanusClient } from './ws';

const root = createRoot(document.querySelector('#root')!);

startClientPageLifecycle(
  () => new JanusClient(),
  (client) => root.render(
    <React.StrictMode>
      <App client={client} />
    </React.StrictMode>,
  ),
);
