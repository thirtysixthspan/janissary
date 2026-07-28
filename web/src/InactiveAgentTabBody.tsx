import React, { useRef } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import { AgentTabMeta } from './AgentTabMeta';
import { Transcript } from './Transcript';

export function InactiveAgentTabBody({
  tab, client, onSplit,
}: { tab: TabView; client: JanusClient; onSplit: () => void }) {
  const transcriptReference = useRef<HTMLDivElement>(null);
  return (
    <div className="tab-body" style={{ borderLeft: `4px solid ${tab.dotColor}` }}>
      <AgentTabMeta cwd={tab.cwd} flags={tab.flags} onSplit={onSplit} />
      <div className="main">
        <Transcript
          lines={tab.bufferLines}
          client={client}
          onToggleCollapse={() => {}}
          onPromptClick={() => {}}
          scrollRef={transcriptReference}
        />
      </div>
    </div>
  );
}
