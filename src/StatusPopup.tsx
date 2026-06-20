import React from 'react';
import { homedir } from 'node:os';
import { basename } from 'node:path';
import { Box, Text } from 'ink';
import type { ThemeColors } from './theme.js';

const WORKSPACE_MARKER = '.janussary/';
const TITLE = 'connections';

// Shorten a working directory for display: if it lives inside an agent workspace, show it
// starting at `workspace/<agent>/...`; otherwise abbreviate the home directory to `~`.
const shortCwd = (p: string): string => {
  const i = p.indexOf(WORKSPACE_MARKER + 'workspace/');
  if (i >= 0) return p.slice(i + WORKSPACE_MARKER.length);
  const home = homedir();
  return p === home ? '~' : p.startsWith(home + '/') ? '~' + p.slice(home.length) : p;
};

type Props = {
  shell?: string;
  cwd: string;
  provider?: string;
  model?: string;
  theme: ThemeColors;
};

/**
 * A small titled status panel anchored to the bottom-right, floating just above the
 * prompt bar. Shows the shell + working directory once a shell is running, and the
 * connected ACP provider/model, on separate lines. Ink's Box has no border title, so the
 * rounded border is drawn manually with the title embedded in the top edge.
 */
export const StatusPopup = ({ shell, cwd, provider, model, theme }: Props) => {
  const lines: { text: string; color: string }[] = [];
  if (shell) lines.push({ text: `${basename(shell)}:${shortCwd(cwd)}`, color: theme.muted });
  if (provider) lines.push({ text: `${provider}:${model ?? '?'}`, color: theme.accent });

  const bodyWidth = Math.max(TITLE.length, 0, ...lines.map((l) => l.text.length));
  const span = bodyWidth + 2; // a space of padding on each side
  const topFill = '─'.repeat(Math.max(0, span - 1 - TITLE.length));

  return (
    <Box position="absolute" right={2} bottom={3} flexDirection="column" backgroundColor={theme.bgSoft}>
      <Box>
        <Text color={theme.faint}>╭─</Text>
        <Text color={theme.muted}>{TITLE}</Text>
        <Text color={theme.faint}>{topFill}╮</Text>
      </Box>
      {lines.map((l, i) => (
        <Box key={i}>
          <Text color={theme.faint}>│ </Text>
          <Text color={l.color}>{l.text.padEnd(bodyWidth)}</Text>
          <Text color={theme.faint}> │</Text>
        </Box>
      ))}
      <Text color={theme.faint}>╰{'─'.repeat(span)}╯</Text>
    </Box>
  );
};
