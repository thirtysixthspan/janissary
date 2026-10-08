import React, { useEffect, useState } from 'react';
import type { JanusClient } from '../ws';
import { AppCommandBarTabScope, useAppCommandBar } from '../shared/command-bar/AppCommandBar';

function FixtureBar({ client, onSplit }: { client: JanusClient; onSplit?: () => void }) {
  const bar = useAppCommandBar();
  const [line, setLine] = useState('');
  const register = bar.registerCommandLineInsertion;
  useEffect(() => register(setLine), [register]);
  return <>
    <button title="Split" onClick={onSplit}>Split</button>
    <textarea value={line} onChange={(event) => setLine(event.target.value)} onKeyDown={(event) => {
      if (event.key !== 'Enter') return;
      if (!bar.intercept(line)) client.send({ method: 'command', params: { text: line } });
      setLine('');
    }} />
  </>;
}

// A minimal command-bar plugin exercises application composition independently of terminal I/O.
// The real shell plugin's own suites cover command transport, completion, and terminal behavior.
export function AppPluginFixture({ label, active, client, onSplit }: {
  label: string; active: boolean; client: JanusClient; onSplit?: () => void;
}) {
  return <AppCommandBarTabScope label={label} active={active}>
    <FixtureBar client={client} onSplit={onSplit} />
  </AppCommandBarTabScope>;
}
