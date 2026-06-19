import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import type { Tab } from './tab.js';
import type { AgentState } from './agent-state.js';
import type { ThemeColors } from './theme.js';

type Props = {
  tabs: Tab[];
  agentStates: Record<string, AgentState>;
  activeTab: number;
  theme: ThemeColors;
  scrollBoundaryHit: boolean;
};

export const TabStrip = ({ tabs, agentStates, activeTab, theme, scrollBoundaryHit }: Props) => {
  const [flash, setFlash] = useState(false);

  const hasActive = Object.values(agentStates).some((s) => s.active);

  useEffect(() => {
    if (!hasActive) {
      setFlash(false);
      return;
    }
    const id = setInterval(() => setFlash((f) => !f), 600);
    return () => clearInterval(id);
  }, [hasActive]);

  return (
    <Box
      backgroundColor={theme.bgSoft}
      flexDirection="row"
      flexWrap="wrap"
      alignItems="stretch"
    >
      {tabs.map((tab, i) => {
        const isActive = i === activeTab;
        const agentActive = agentStates[tab.label]?.active ?? false;
        const dotColor = scrollBoundaryHit && isActive ? 'red' : agentActive && !flash ? theme.bgSoft : tab.dotColor;
        return (
          <Box
            key={tab.label}
            paddingX={2}
            paddingY={1}
            alignItems="center"
            gap={1}
            backgroundColor={isActive ? theme.bg : undefined}
          >
            <Text color={dotColor}>{'●'}</Text>
            <Text color={isActive ? theme.fg : theme.muted}>
              {tab.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
