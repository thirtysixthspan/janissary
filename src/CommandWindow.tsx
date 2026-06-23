import React from 'react';
import { Text, Box } from 'ink';
import type { ThemeColors } from './theme.js';

type Props = {
  beforeCursor: string;
  afterCursor: string;
  dotColor: string;
  historyItems: string[];
  historySelectedIdx: number;
  historyOpen: boolean;
  theme: ThemeColors;
};

export const CommandWindow = ({ beforeCursor, afterCursor, dotColor, historyItems, historySelectedIdx, historyOpen, theme }: Props) => (
  <Box borderStyle="single" paddingX={1} flexShrink={0} flexDirection="column">
    {historyOpen && historyItems.length > 0 && (
      <Box flexDirection="column">
        {historyItems.map((cmd, i) => {
          const isSelected = i === historySelectedIdx;
          return (
            <Box key={i} backgroundColor={isSelected ? theme.accent : undefined} marginLeft={-1} marginRight={-1} paddingX={2}>
              <Text color={isSelected ? theme.bg : theme.fg}>
                {cmd}
              </Text>
            </Box>
          );
        })}
      </Box>
    )}
    <Box flexGrow={1}>
      <Text bold color={dotColor}>{'>'}</Text>
      <Text> </Text>
      <Text>{beforeCursor}</Text>
      <Text inverse>{beforeCursor.length > 0 && afterCursor.length === 0 ? ' ' : afterCursor[0] || ' '}</Text>
      <Text>{afterCursor.slice(1)}</Text>
    </Box>
  </Box>
);
