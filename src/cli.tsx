import React, { useState, useRef, useEffect } from 'react';
import { exec } from 'node:child_process';
import { render, Text, Box, useInput, useApp, useWindowSize } from 'ink';
import { getOutput } from './commands.js';

type LogEntry = {
  input: string;
  output: string;
  running?: boolean;
};

export const App = () => {
  const { exit } = useApp();
  const { rows } = useWindowSize();

  const [log, setLog] = useState<LogEntry[]>([]);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [input, setInput] = useState('');
  const [cursor, setCursor] = useState(0);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [cmdHistoryIdx, setCmdHistoryIdx] = useState(-1);
  const unmountedRef = useRef(false);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  const visibleLog = scrollOffset === 0
    ? log
    : log.slice(0, Math.max(0, log.length - scrollOffset));

  const executeRef = useRef<((cmd: string) => void) | null>(null);
  executeRef.current = (cmd: string) => {
    const trimmed = cmd.trim();
    setCmdHistory((prev) => {
      const next = [...prev, trimmed];
      return next.length > 100 ? next.slice(-100) : next;
    });
    setCmdHistoryIdx(-1);

    if (trimmed.startsWith('`')) {
      const shellCmd = trimmed.slice(1).trim();
      const input = trimmed;
      setLog((prev) => [...prev, { input, output: '', running: true }]);
      setScrollOffset(0);

      exec(shellCmd, { timeout: 30_000 }, (error, stdout, stderr) => {
        if (unmountedRef.current) return;

        const result = stdout || stderr || '';
        const output = error
          ? error.killed
            ? `Command timed out after 30s:\n${result || shellCmd}`
            : `Error: ${error.message}${result ? '\n' + result : ''}`
          : result || '(no output)';

        setLog((prev) => {
          const next = [...prev];
          const idx = next.findLastIndex((e) => e.input === input && e.running);
          if (idx >= 0) {
            next[idx] = { ...next[idx], output, running: false };
          }
          return next;
        });
      });
      return;
    }

    const output = getOutput(cmd);
    if (output === null && cmd.trim().toLowerCase() === 'clear') {
      setLog([]);
      setScrollOffset(0);
      return;
    }
    if (output === null && (cmd.trim().toLowerCase() === 'quit' || cmd.trim().toLowerCase() === 'exit')) {
      exit();
      return;
    }
    if (output !== null) {
      setLog((prev) => [...prev, { input: trimmed, output }]);
      setScrollOffset(0);
    }
  };

  useInput((inputChar, key) => {
    if (key.ctrl && inputChar === 'c') {
      exit();
      return;
    }

    if (key.return) {
      executeRef.current?.(input);
      setInput('');
      setCursor(0);
      return;
    }

    if (key.backspace || key.delete) {
      if (cursor > 0) {
        setInput((prev) => prev.slice(0, cursor - 1) + prev.slice(cursor));
        setCursor((prev) => prev - 1);
      }
      return;
    }

    if (key.leftArrow) {
      setCursor((prev) => (prev > 0 ? prev - 1 : 0));
      return;
    }

    if (key.rightArrow) {
      setCursor((prev) => (prev < input.length ? prev + 1 : input.length));
      return;
    }

    if (key.upArrow) {
      setScrollOffset((prev) => {
        const maxOffset = Math.max(0, log.length - 1);
        return Math.min(prev + 1, maxOffset);
      });
      return;
    }

    if (key.downArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.ctrl && inputChar === 'p') {
      if (cmdHistory.length > 0) {
        const idx = cmdHistoryIdx === -1 ? cmdHistory.length - 1 : Math.max(0, cmdHistoryIdx - 1);
        setCmdHistoryIdx(idx);
        setInput(cmdHistory[idx]);
        setCursor(cmdHistory[idx].length);
      }
      return;
    }

    if (key.ctrl && inputChar === 'n') {
      if (cmdHistoryIdx >= 0) {
        const idx = cmdHistoryIdx + 1;
        if (idx >= cmdHistory.length) {
          setCmdHistoryIdx(-1);
          setInput('');
          setCursor(0);
        } else {
          setCmdHistoryIdx(idx);
          setInput(cmdHistory[idx]);
          setCursor(cmdHistory[idx].length);
        }
      }
      return;
    }

    if (key.tab || key.escape || key.shift) {
      return;
    }

    if (inputChar.length === 1) {
      setInput((prev) => prev.slice(0, cursor) + inputChar + prev.slice(cursor));
      setCursor((prev) => prev + 1);
    }
  });

  const beforeCursor = input.slice(0, cursor);
  const afterCursor = input.slice(cursor);
  const atBottom = scrollOffset === 0;

  return (
    <Box flexDirection="column" height={rows}>
      <Box borderStyle="round" paddingX={1}>
        <Text bold>Janissary</Text>
        <Text dimColor>  —  {log.length} commands executed</Text>
      </Box>

      <Box flexGrow={1} flexDirection="column" paddingX={1} paddingY={0}>
        {visibleLog.length === 0 && (
          <Box paddingY={1}>
            <Text dimColor>Type "help" for available commands.</Text>
          </Box>
        )}
        {visibleLog.map((entry, i) => (
          <Box key={i} flexDirection="column">
            <Box>
              <Text bold color="green">{'>'}</Text>
              <Text> </Text>
              <Text>{entry.input}</Text>
              {entry.running && <Text color="yellow">  Running...</Text>}
            </Box>
            {!entry.running && entry.output && (
              <Box paddingLeft={2}>
                <Text>{entry.output}</Text>
              </Box>
            )}
          </Box>
        ))}
      </Box>

      <Box borderStyle="single" paddingX={1} flexShrink={0}>
        <Box flexGrow={1}>
          <Text bold color="green">{'>'}</Text>
          <Text> </Text>
          <Text>{beforeCursor}</Text>
          <Text inverse>{beforeCursor.length > 0 && afterCursor.length === 0 ? ' ' : afterCursor[0] || ' '}</Text>
          <Text>{afterCursor.slice(1)}</Text>
        </Box>
        {!atBottom && log.length > 0 && (
          <Text dimColor>
            — scroll ({scrollOffset})
          </Text>
        )}
      </Box>
    </Box>
  );
};

if (!process.env.VITEST) {
  render(<App />, { alternateScreen: true });
}
