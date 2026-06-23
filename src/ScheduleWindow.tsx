import React from 'react';
import { Box, Text } from 'ink';
import { fmtNextRun } from './schedule.js';
import type { ScheduleEntry, ThemeColors } from './types.js';

const TITLE = 'schedule';

type Props = {
  entries: ScheduleEntry[];
  top: number;
  theme: ThemeColors;
};

/**
 * Build the schedule window's body: one line per scheduled timer, showing its id/name, the
 * human-readable schedule, and the next run time. Pure, so it can be unit-tested directly.
 */
export const scheduleLines = (
  entries: ScheduleEntry[],
  theme: ThemeColors,
): { text: string; color: string }[] =>
  entries.map((e) => ({
    text: `${e.id}  ${e.spec}  (next: ${fmtNextRun(e.nextRun)})`,
    color: e.recurring ? theme.accent : theme.fg,
  }));

/**
 * A small titled `schedule` window anchored to the top-right, mirroring the connection
 * window and stacked just below it (its `top` is computed by the caller from the
 * connection window's height). Lists the active agent's scheduled timers; the caller only
 * renders it when there is at least one. The rounded border is drawn manually with the
 * title embedded in the top edge, matching `ConnectionWindow`.
 */
export const ScheduleWindow = ({ entries, top, theme }: Props) => {
  const lines = scheduleLines(entries, theme);
  const bodyWidth = Math.max(TITLE.length, 0, ...lines.map((l) => l.text.length));
  const span = bodyWidth + 2;
  const topFill = '─'.repeat(Math.max(0, span - 1 - TITLE.length));

  return (
    <Box position="absolute" right={2} top={top} flexDirection="column" backgroundColor={theme.bgSoft}>
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
