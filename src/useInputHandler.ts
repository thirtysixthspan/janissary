import { useInput } from 'ink';
import type { ChildProcess } from 'node:child_process';
import type { Tab } from './tab.js';
import { useRef } from 'react';
import { flattenBuffer, swapTabsLeft, swapTabsRight } from './tab.js';
import { completeCommandLine } from './completion.js';
import { nextScrollStep, initialScrollAccel, type ScrollAccel } from './scroll.js';

export type InputHandlerDeps = {
  input: string;
  cursor: number;
  setInput: (fn: ((prev: string) => string) | string) => void;
  setCursor: (fn: ((prev: number) => number) | number) => void;
  tabs: Tab[];
  activeTab: number;
  setTabs: (updater: (prev: Tab[]) => Tab[]) => void;
  setActiveTab: (fn: ((prev: number) => number) | number) => void;
  updateCurrentTab: (updater: (tab: Tab) => Tab) => void;
  executeRef: { current: ((cmd: string) => void) | null };
  shellsRef: { current: Map<number, ChildProcess> };
  visibleHeight: number;
  exit: () => void;
  historyPickerOpen: boolean;
  historyPickerIdx: number;
  setHistoryPickerOpen: (open: boolean) => void;
  setHistoryPickerIdx: (fn: ((prev: number) => number) | number) => void;
  frequentHistory: string[];
  flashScrollBoundary: () => void;
  interactive: boolean;
  cwd: string;
  agents: string[];
  connections: string[];
};

export function useInputHandler(deps: InputHandlerDeps): void {
  const {
    input, cursor, setInput, setCursor,
    tabs, activeTab, setTabs, setActiveTab,
    updateCurrentTab, executeRef, shellsRef,
    visibleHeight, exit,
    historyPickerOpen, historyPickerIdx, setHistoryPickerOpen, setHistoryPickerIdx,
    frequentHistory, flashScrollBoundary, interactive, cwd, agents, connections,
  } = deps;

  // Tracks continuous-scroll timing so the step accelerates the longer you keep scrolling.
  const accelRef = useRef<ScrollAccel>(initialScrollAccel);
  const scrollStep = (dir: number): number => {
    const { step, state } = nextScrollStep(accelRef.current, dir, Date.now());
    accelRef.current = state;
    return step;
  };

  const scrollUp = () => {
    const step = scrollStep(1);
    updateCurrentTab((tab) => {
      const len = flattenBuffer(tab.log).length;
      const maxOff = Math.max(0, len - visibleHeight);
      if (tab.scrollOffset >= maxOff) { process.stderr.write('\x07'); flashScrollBoundary(); return tab; }
      return { ...tab, scrollOffset: Math.min(tab.scrollOffset + step, maxOff) };
    });
  };

  const scrollDown = () => {
    const step = scrollStep(-1);
    updateCurrentTab((tab) => {
      if (tab.scrollOffset <= 0) { process.stderr.write('\x07'); flashScrollBoundary(); return tab; }
      return { ...tab, scrollOffset: Math.max(0, tab.scrollOffset - step) };
    });
  };

  useInput((inputChar, key) => {
    // While an interactive program owns the terminal, its keystrokes are forwarded
    // straight to the PTY; Ink should not act on them.
    if (interactive) return;

    if (key.ctrl && inputChar === 'c') {
      for (const [, shell] of shellsRef.current) {
        shell.kill();
      }
      shellsRef.current.clear();
      exit();
      return;
    }

    if (historyPickerOpen) {
      if (key.upArrow) {
        setHistoryPickerIdx((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setHistoryPickerIdx((prev) => Math.min(frequentHistory.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        const cmd = frequentHistory[historyPickerIdx];
        if (cmd) {
          executeRef.current?.(cmd);
          setInput('');
          setCursor(0);
        }
        setHistoryPickerOpen(false);
        return;
      }
      if (key.escape) {
        setHistoryPickerOpen(false);
        return;
      }
      return;
    }

    if (key.return) {
      if (input.trim()) {
        executeRef.current?.(input);
      } else {
        updateCurrentTab((tab) => ({
          ...tab,
          log: [...tab.log, { input: '', output: '', running: false }],
          scrollOffset: 0,
        }));
      }
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

    if (key.ctrl && key.leftArrow) {
      setTabs((prev) => swapTabsLeft(prev, activeTab));
      setActiveTab((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.ctrl && key.rightArrow) {
      setTabs((prev) => swapTabsRight(prev, activeTab));
      setActiveTab((prev) => Math.min(prev + 1, tabs.length - 1));
      return;
    }

    // Scroll the transcript with Shift or Ctrl + arrow (whichever the terminal sends).
    if ((key.ctrl || key.shift) && key.upArrow) {
      scrollUp();
      return;
    }

    if ((key.ctrl || key.shift) && key.downArrow) {
      scrollDown();
      return;
    }

    if (key.shift && key.leftArrow) {
      if (tabs.length > 1) {
        setActiveTab((prev: number) => (prev - 1 + tabs.length) % tabs.length);
      }
      return;
    }

    if (key.shift && key.rightArrow) {
      if (tabs.length > 1) {
        setActiveTab((prev: number) => (prev + 1) % tabs.length);
      }
      return;
    }

    if (key.leftArrow || (key.ctrl && inputChar === 'b')) {
      setCursor((prev) => (prev > 0 ? prev - 1 : 0));
      return;
    }

    if (key.rightArrow || (key.ctrl && inputChar === 'f')) {
      setCursor((prev) => (prev < input.length ? prev + 1 : input.length));
      return;
    }

    if (key.ctrl && inputChar === 'r') {
      if (frequentHistory.length > 0) {
        setHistoryPickerIdx(frequentHistory.length - 1);
        setHistoryPickerOpen(true);
      }
      return;
    }

    if (key.upArrow) {
      updateCurrentTab((tab) => {
        if (tab.cmdHistory.length === 0) return tab;
        const idx = tab.cmdHistoryIdx === -1
          ? tab.cmdHistory.length - 1
          : Math.max(0, tab.cmdHistoryIdx - 1);
        setInput(tab.cmdHistory[idx]);
        setCursor(tab.cmdHistory[idx].length);
        return { ...tab, cmdHistoryIdx: idx };
      });
      return;
    }

    if (key.downArrow) {
      updateCurrentTab((tab) => {
        if (tab.cmdHistoryIdx < 0) return tab;
        const idx = tab.cmdHistoryIdx + 1;
        if (idx >= tab.cmdHistory.length) {
          setInput('');
          setCursor(0);
          return { ...tab, cmdHistoryIdx: -1 };
        }
        setInput(tab.cmdHistory[idx]);
        setCursor(tab.cmdHistory[idx].length);
        return { ...tab, cmdHistoryIdx: idx };
      });
      return;
    }

    if (key.ctrl && inputChar === 'p') {
      scrollUp();
      return;
    }

    if (key.ctrl && inputChar === 'n') {
      scrollDown();
      return;
    }

    if (key.pageUp) {
      scrollUp();
      return;
    }

    if (key.pageDown) {
      scrollDown();
      return;
    }

    if (key.escape) {
      updateCurrentTab((tab) => ({ ...tab, scrollOffset: 0 }));
      return;
    }

    if (key.tab) {
      const { newInput, newCursor, matches } = completeCommandLine(input, cursor, cwd, agents, connections);
      if (newInput !== input) {
        setInput(newInput);
        setCursor(newCursor);
      } else if (matches.length > 1) {
        // Nothing more to fill in: show the candidate files in the transcript.
        updateCurrentTab((tab) => ({
          ...tab,
          log: [...tab.log, { input: '', output: matches.join('  ') }],
          scrollOffset: 0,
        }));
      }
      return;
    }

    // Printable input: a single typed character or a multi-character chunk pasted
    // from the clipboard. Strip control characters (stray escape / bracketed-paste
    // markers, newlines, tabs) so pasted text lands cleanly on the command line.
    if (inputChar && !key.ctrl && !key.meta) {
      // eslint-disable-next-line no-control-regex -- intentionally stripping control chars from pasted input
      const text = inputChar.replace(/[\x00-\x1f\x7f]/g, '');
      if (text) {
        setInput((prev) => prev.slice(0, cursor) + text + prev.slice(cursor));
        setCursor((prev) => prev + text.length);
      }
    }
  });
}
