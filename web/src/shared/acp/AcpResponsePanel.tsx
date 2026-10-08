import { useRef } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../../ws';
import { Transcript } from '../transcript/Transcript';
import { transcriptIntents } from '../transcript/transcript-intents';
import { ptyActions } from '../terminal/pty-actions';
import './acp-response.css';

export function AcpResponsePanel({ response, label, client }: {
  response: NonNullable<TabView['acpResponse']>;
  label: string;
  client: JanusClient;
}) {
  const scrollReference = useRef<HTMLDivElement>(null);
  const panelReference = useRef<HTMLElement>(null);
  const toggle = () => {
    client.send({ method: 'toggleCollapse', params: { tab: label } });
    panelReference.current?.focus();
  };
  const send: JanusClient['send'] = (call) => {
    client.send(call.method === 'command' ? { ...call, params: { ...call.params, tab: label } } : call);
  };
  return (
    <section className="acp-response" aria-label="ACP responses" ref={panelReference} tabIndex={0}
      onKeyDown={(event) => {
        if (event.key !== 't' || !event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}>
      <div className="acp-response-header">
        <strong>ACP</strong>
        {response.running && <span role="status">Responding…</span>}
        <button type="button" onClick={() => client.send({ method: 'resetAcp', params: { tab: label } })}>
          Reset ACP
        </button>
      </div>
      <Transcript
        lines={response.lines}
        intents={transcriptIntents(send)}
        ptyActions={ptyActions(client)}
        onToggleCollapse={toggle}
        onPromptClick={() => {}}
        scrollRef={scrollReference}
        showEmptyHint={false}
      />
    </section>
  );
}
