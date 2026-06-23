import React, { useState, useEffect } from 'react';
import { Text, Box } from 'ink';
import type { Tab, AgentState, ThemeColors } from './types.js';

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
        // When busy, blink the dot fully on/off by hiding it against the tab's own
        // background (content bg for the active tab, bar bg for the rest).
        const offColor = isActive ? theme.bg : theme.bgSoft;
        const dotColor = scrollBoundaryHit && isActive ? 'red' : agentActive && !flash ? offColor : tab.dotColor;
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
