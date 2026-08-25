import React, { useRef } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { AgentTabMeta } from './AgentTabMeta';
import { Transcript } from './transcript/Transcript';
import { CommandInput } from './command-input/CommandInput';
import { StatusPanels } from './StatusPanels';
import { useStatusWindows } from './useStatusWindows';
import { statusButton } from './status-button';
import { tabBodyBorder } from './tab-body-border';
import { agentTabIntents } from './agent-tab-intents';

export function InactiveAgentTabBody({
  tab, client, onSplit,
}: { tab: TabView; client: JanusClient; onSplit: () => void }) {
  const transcriptReference = useRef<HTMLDivElement>(null);
  const inputReference = useRef<HTMLTextAreaElement>(null);
  const statusWindows = useStatusWindows(tab.label, tab.connections.length > 0, tab.schedule.length > 0);
  const intents = agentTabIntents(client, tab.label);
  return (
    <div
      className="tab-body"
      style={{ borderLeft: tabBodyBorder(tab.dotColor, false) }}
      onMouseUp={() => {
        if (!globalThis.getSelection()?.toString()) inputReference.current?.focus();
      }}
    >
      <AgentTabMeta
        cwd={tab.cwd}
        flags={tab.flags}
        onOpenFileNavigator={intents.onOpenFileNavigator}
        onLaunchAgentHere={tab.cwd === undefined ? undefined : intents.onLaunchAgentHere}
        onOpenTranscript={intents.onOpenTranscript}
        connectionsButton={statusButton(tab.connections.length > 0, statusWindows.connections)}
        scheduleButton={statusButton(tab.schedule.length > 0, statusWindows.schedule)}
        onSplit={onSplit}
      />
      <div className="main">
        <Transcript
          lines={tab.bufferLines}
          client={client}
          onToggleCollapse={intents.onToggleCollapse}
          onPromptClick={(text) => client.send({ method: 'command', params: { text } })}
          scrollRef={transcriptReference}
        />
        <StatusPanels
          tab={tab}
          connections={statusWindows.connections}
          schedule={statusWindows.schedule}
          interactive
          onOpenAcpTranscript={intents.onOpenAcpTranscript}
        />
      </div>
      <CommandInput
        dotColor={tab.dotColor}
        history={tab.cmdHistory}
        ghostHistory={[]}
        onSubmit={(text) => client.send({ method: 'command', params: { text } })}
        inputRef={inputReference}
        complete={(text, cursor) => client.request({ method: 'complete', params: { text, cursor } })}
        pickerOpen={false}
        busy={tab.busy}
        autoFocus={false}
      />
    </div>
  );
}
