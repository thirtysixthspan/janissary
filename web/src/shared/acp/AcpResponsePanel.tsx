import { useRef } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../ws/ws';
import { Transcript } from '../transcript/Transcript';
import { useAcpPanelActions } from './useAcpPanelActions';
import './acp-response.css';

export function AcpResponsePanel({ response, label, client }: {
  response: NonNullable<TabView['acpResponse']>;
  label: string;
  client: JanusClient;
}) {
  const scrollReference = useRef<HTMLDivElement>(null);
  const panelReference = useRef<HTMLElement>(null);
  const actions = useAcpPanelActions(client, label);
  const toggle = () => {
    actions.toggleCollapse();
    panelReference.current?.focus();
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
        <button type="button" onClick={actions.reset}>
          Reset ACP
        </button>
      </div>
      <Transcript
        lines={response.lines}
        intents={actions.intents}
        ptyActions={actions.ptyActions}
        onToggleCollapse={toggle}
        onPromptClick={() => {}}
        scrollRef={scrollReference}
        showEmptyHint={false}
      />
    </section>
  );
}
