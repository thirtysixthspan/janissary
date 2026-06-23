import React from 'react';
import { homedir } from 'node:os';
import { Text, Box } from 'ink';
import type { BufferLine, ThemeColors } from './types.js';

const formatCwd = (cwd: string): string => {
  const home = homedir();
  return cwd === home ? '~' : cwd.startsWith(home + '/') ? '~' + cwd.slice(home.length) : cwd;
};

type Props = {
  visibleLines: BufferLine[];
  scrollChars: string[];
  visibleHeight: number;
  dotColor: string;
  theme: ThemeColors;
};

export const Transcript = ({ visibleLines, scrollChars, visibleHeight, dotColor, theme }: Props) => (
  <Box flexGrow={1} flexDirection="column" paddingX={1} paddingY={0}>
    {Array.from({ length: visibleHeight }, (_, row) => {
      const line = visibleLines[row];
      // No content for this row: render it blank (no left rail) so an empty or short transcript
      // doesn't draw a full-height border column around nothing.
      if (!line) {
        return (
          <Box key={row}>
            <Text> </Text>
          </Box>
        );
      }
      // Spacer separators are a single blank row with no left border. The space keeps the row 1 tall.
      if (line.type === 'spacer') {
        return (
          <Box key={row}>
            <Text> </Text>
          </Box>
        );
      }
      let content: React.ReactNode;
      if (line.type === 'prompt') {
        content = (
          <Box flexGrow={1} paddingLeft={line.acp ? 4 : 2} paddingRight={2} backgroundColor={theme.bgSoft}>
            {line.cwd && (
              <Text color={theme.muted} backgroundColor={theme.bgSoft}>{formatCwd(line.cwd)} </Text>
            )}
            <Text bold color={dotColor} backgroundColor={theme.bgSoft}>{line.acp ? '+' : '>'}</Text>
            <Text backgroundColor={theme.bgSoft}> </Text>
            <Text wrap="truncate" backgroundColor={theme.bgSoft}>{line.text}</Text>
          </Box>
        );
      } else if (line.type === 'message') {
        const label =
          line.msgKind === 'request' ? `request from ${line.from}: ${line.text}`
          : line.msgKind === 'response' ? `${line.from}:`
          : `${line.from}: ${line.text}`;
        content = (
          <Box>
            <Text color={line.fromColor ?? dotColor}>{'● '}</Text>
            <Text wrap="truncate" color={theme.fg}>{label}</Text>
          </Box>
        );
      } else if (line.type === 'collapsed') {
        // A collapsed run of auto-run agent tool steps. Indented like an acp line, no
        // left border, with a hint showing the toggle key.
        content = (
          <Box paddingLeft={4}>
            <Text color={dotColor}>{'▸ '}</Text>
            <Text wrap="truncate" color={theme.muted}>{line.text}  (ctrl+t to expand)</Text>
          </Box>
        );
      } else if (line.type === 'output') {
        content = (
          <Box paddingLeft={line.acp ? 4 : 2}>
            <Text wrap="truncate" color={theme.fg}>{line.text}</Text>
          </Box>
        );
      } else {
        content = (
          <Box paddingLeft={2}>
            <Text wrap="truncate">{line.text}</Text>
          </Box>
        );
      }
      const borderColor = line.fromColor ?? dotColor;
      return (
        <Box key={row} flexDirection="row">
          {!line.acp && (
            <Box flexShrink={0} width={1}>
              <Text color={borderColor}>│</Text>
            </Box>
          )}
          <Box flexGrow={1}>{content}</Box>
        </Box>
      );
    })}
    {/* Scrollbar overlay — same right-edge position, rendered last so it sits on a higher z layer (painted over the transcript content). */}
    <Box position="absolute" flexDirection="column" right={0} top={0}>
      {Array.from({ length: visibleHeight }, (_, row) => (
        <Text key={row} color={theme.faint}>{scrollChars[row] ?? '·'}</Text>
      ))}
    </Box>
  </Box>
);
