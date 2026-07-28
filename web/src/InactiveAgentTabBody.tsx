import React, { useRef } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { AgentTabMeta } from './AgentTabMeta';
import { Transcript } from './Transcript';
import { CommandInput } from './CommandInput';
import { StatusPanels } from './StatusPanels';
import { useStatusWindows } from './useStatusWindows';
import { tabBodyBorder } from './tab-body-border';

export function InactiveAgentTabBody({
  tab, client, onSplit,
}: { tab: TabView; client: JanusClient; onSplit: () => void }) {
  const transcriptReference = useRef<HTMLDivElement>(null);
  const inputReference = useRef<HTMLTextAreaElement>(null);
  const statusWindows = useStatusWindows(tab.label, tab.connections.length > 0, tab.schedule.length > 0);
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
        onOpenFileNavigator={() => client.send({ method: 'openFileNavigatorFor', params: { label: tab.label } })}
        onLaunchAgentHere={tab.cwd === undefined ? undefined : () => client.send({ method: 'launchAgentFor', params: { label: tab.label } })}
        onOpenTranscript={() => client.send({ method: 'openTranscriptFor', params: { label: tab.label } })}
        connectionsButton={{
          hasContent: tab.connections.length > 0,
          onEnter: statusWindows.connections.onButtonEnter,
          onLeave: statusWindows.connections.onButtonLeave,
          onClick: statusWindows.connections.onButtonClick,
        }}
        scheduleButton={{
          hasContent: tab.schedule.length > 0,
          onEnter: statusWindows.schedule.onButtonEnter,
          onLeave: statusWindows.schedule.onButtonLeave,
          onClick: statusWindows.schedule.onButtonClick,
        }}
        onSplit={onSplit}
      />
      <div className="main">
        <Transcript
          lines={tab.bufferLines}
          client={client}
          onToggleCollapse={() => client.send({ method: 'toggleCollapse', params: {} })}
          onPromptClick={(text) => client.send({ method: 'command', params: { text } })}
          scrollRef={transcriptReference}
        />
        <StatusPanels
          tab={tab}
          connections={statusWindows.connections}
          schedule={statusWindows.schedule}
          interactive
          onOpenAcpTranscript={(acpRef) => client.send({ method: 'openAcpTranscript', params: { acpRef } })}
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
