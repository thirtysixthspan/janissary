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
  dbConnections?: string[];
  theme: ThemeColors;
};

/**
 * Build the popup's body lines: shell + cwd, the ACP agent as a connection string
 * (`acp:<agent>`), and one line per open SQLite connection. Pure, so it can be
 * unit-tested without rendering.
 */
export const statusLines = (
  { shell, cwd, provider, dbConnections, theme }: Props,
): { text: string; color: string }[] => {
  const lines: { text: string; color: string }[] = [];
  if (shell) lines.push({ text: `${basename(shell)}:${shortCwd(cwd)}`, color: theme.muted });
  if (provider) lines.push({ text: `acp:${provider}`, color: theme.accent });
  for (const name of dbConnections ?? []) lines.push({ text: `sqlite:${name}`, color: theme.fg });
  return lines;
};

/**
 * A small titled status panel anchored to the top-right, floating just below the tab
 * strip. Shows, on separate lines, the shell + working directory once a shell is
 * running, the connected ACP agent (`acp:<agent>`), and any open SQLite connections
 * this tab has accessed. Ink's Box has no border title, so the rounded border is drawn
 * manually with the title embedded in the top edge.
 */
export const StatusPopup = (props: Props) => {
  const { theme } = props;
  const lines = statusLines(props);

  const bodyWidth = Math.max(TITLE.length, 0, ...lines.map((l) => l.text.length));
  const span = bodyWidth + 2; // a space of padding on each side
  const topFill = '─'.repeat(Math.max(0, span - 1 - TITLE.length));

  return (
    <Box position="absolute" right={2} top={3} flexDirection="column" backgroundColor={theme.bgSoft}>
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
