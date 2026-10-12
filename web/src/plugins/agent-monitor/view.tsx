import { useState } from 'react';
import { ReadOnlyTranscript, type AgentRunView, type TabPluginClientCapabilities } from '../api';

export function AgentMonitor({ run, capabilities }: {
  run?: AgentRunView;
  capabilities: TabPluginClientCapabilities;
}) {
  if (!run) return <div className="agent-monitor">Agent run is no longer available.</div>;
  return <RunningMonitor run={run} capabilities={capabilities} />;
}

function RunningMonitor({ run, capabilities }: { run: AgentRunView; capabilities: TabPluginClientCapabilities }) {
  const [error, setError] = useState('');
  const terminate = async () => {
    setError('');
    try {
      await capabilities.intent('terminate', {});
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : String(error_));
    }
  };
  return (
    <section className="agent-monitor" aria-label="Agent monitor">
      <header>
        <div><strong>{run.task}</strong><span>{run.command}</span><span>{run.model} · {run.effort}</span><span>{run.host} · {run.workspace}</span></div>
        <div><b>{run.status}</b><button disabled={['Cleaning up', 'Completed', 'Failed', 'Terminated'].includes(run.status)} onClick={() => { void terminate(); }}>Terminate</button></div>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className="agent-monitor-activity" aria-live="polite">
        <ReadOnlyTranscript lines={run.activity.map((entry) => ({
          type: entry.kind === 'message' ? 'markdown' : 'output',
          text: entry.kind === 'message' ? entry.text : `${entry.kind}\n${entry.text}`,
        }))} />
      </div>
      {run.response && <footer><b>Final response</b><pre>{run.response}</pre></footer>}
    </section>
  );
}
