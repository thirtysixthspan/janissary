import React from 'react';
import { createRoot } from 'react-dom/client';
import '@xterm/xterm/css/xterm.css';
import './theme.css';
import { App } from './App';
import { JanusClient } from './ws';

// The composition root owns the protocol client: built once here, handed down as a prop, and
// released when the page goes away. `App` is the top of the tree, so there is no hook above it
// whose cleanup could do this.
const client = new JanusClient();
globalThis.addEventListener('pagehide', () => client.dispose());

createRoot(document.querySelector('#root')!).render(
  <React.StrictMode>
    <App client={client} />
  </React.StrictMode>,
);
