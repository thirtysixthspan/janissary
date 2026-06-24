import React, { useEffect, useMemo, useRef, useState } from 'react';
import { JanusClient } from './ws';
import type { TabView } from './protocol';
import { TabStrip } from './TabStrip';
import { Transcript } from './Transcript';
import { CommandInput } from './CommandInput';
import { StatusPanels } from './StatusPanels';

export function App() {
  const clientRef = useRef<JanusClient | null>(null);
  if (!clientRef.current) clientRef.current = new JanusClient();
  const client = clientRef.current;

  const [tabs, setTabs] = useState<TabView[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Select a tab and move the cursor into the command line.
  const selectTab = (index: number) => {
    client.send({ method: 'setActiveTab', params: { index } });
    inputRef.current?.focus();
  };

  useEffect(() => client.onState((nextTabs, active) => { setTabs(nextTabs); setActiveTab(active); }), [client]);

  // App-level chords: Shift+Arrow cycles tabs, Ctrl+T toggles tool-step collapse. Handled on the
  // window so they work whether focus is in the command input or a terminal card.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Matches the spec: Shift+Arrow switches tabs, Ctrl+Arrow reorders the active tab within
      // its group, Ctrl+T toggles tool-step collapse.
      if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: -1 } }); }
      else if (e.ctrlKey && !e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'reorderTab', params: { dir: 1 } }); }
      else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowLeft') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: -1 } }); }
      else if (e.shiftKey && !e.ctrlKey && e.key === 'ArrowRight') { e.preventDefault(); client.send({ method: 'moveTab', params: { dir: 1 } }); }
      else if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); client.send({ method: 'toggleCollapse', params: {} }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [client]);

  const cur = tabs[activeTab] ?? tabs[0];
  const lines = useMemo(() => cur?.bufferLines ?? [], [cur]);

  if (!cur) return <div className="app" style={{ padding: 16, color: 'var(--muted)' }}>Connecting…</div>;

  return (
    <div className="app">
      <TabStrip tabs={tabs} activeTab={activeTab} onSelect={selectTab} />
      <div
        className="tab-body"
        style={{ borderLeft: `4px solid ${cur.dotColor}` }}
        onClick={() => inputRef.current?.focus()}
        onMouseUp={() => {
          const selection = window.getSelection()?.toString();
          if (selection) {
            navigator.clipboard.writeText(selection);
          }
        }}
      >
        <div className="main">
          <Transcript
            lines={lines}
            client={client}
            onToggleCollapse={() => client.send({ method: 'toggleCollapse', params: {} })}
          />
          <StatusPanels tab={cur} />
        </div>
        <CommandInput
          dotColor={cur.dotColor}
          history={cur.cmdHistory}
          onSubmit={(text) => client.send({ method: 'command', params: { text } })}
          inputRef={inputRef}
        />
      </div>
    </div>
  );
}
