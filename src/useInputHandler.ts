import { useInput } from 'ink';
import type { Key } from 'ink';
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

type Binding = {
  test: (inputChar: string, key: Key) => boolean;
  run: () => void;
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

  const accelRef = useRef<ScrollAccel>(initialScrollAccel);
  const scrollStep = (dir: number): number => {
    const { step, state } = nextScrollStep(accelRef.current, dir, Date.now());
    accelRef.current = state;
    return step;
  };

  const scrollUp = () => {
    const step = scrollStep(1);
    updateCurrentTab((tab) => {
      const len = flattenBuffer(tab.log, !tab.toolStepsExpanded).length;
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
    if (interactive) return;

    if (historyPickerOpen) {
      const historyBindings: Binding[] = [
        { test: (_, k) => k.upArrow!, run: () => setHistoryPickerIdx((prev) => Math.max(0, prev - 1)) },
        { test: (_, k) => k.downArrow!, run: () => setHistoryPickerIdx((prev) => Math.min(frequentHistory.length - 1, prev + 1)) },
        { test: (_, k) => k.return!, run: () => {
          const cmd = frequentHistory[historyPickerIdx];
          if (cmd) {
            executeRef.current?.(cmd);
            setInput('');
            setCursor(0);
          }
          setHistoryPickerOpen(false);
        }},
        { test: (_, k) => k.escape!, run: () => setHistoryPickerOpen(false) },
      ];
      for (const b of historyBindings) {
        if (b.test(inputChar, key)) { b.run(); return; }
      }
      return;
    }

    const normalBindings: Binding[] = [
      {
        test: (ch, k) => k.ctrl && ch === 'c',
        run: () => {
          for (const [, shell] of shellsRef.current) shell.kill();
          shellsRef.current.clear();
          exit();
        },
      },
      {
        test: (_, k) => !!k.return,
        run: () => {
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
        },
      },
      {
        test: (_, k) => !!k.backspace || !!k.delete,
        run: () => {
          if (cursor > 0) {
            setInput((prev) => prev.slice(0, cursor - 1) + prev.slice(cursor));
            setCursor((prev) => prev - 1);
          }
        },
      },
      { test: (_, k) => k.ctrl && !!k.leftArrow, run: () => { setTabs((prev) => swapTabsLeft(prev, activeTab)); setActiveTab((prev) => Math.max(0, prev - 1)); } },
      { test: (_, k) => k.ctrl && !!k.rightArrow, run: () => { setTabs((prev) => swapTabsRight(prev, activeTab)); setActiveTab((prev) => Math.min(prev + 1, tabs.length - 1)); } },
      { test: (_, k) => (k.ctrl || k.shift) && !!k.upArrow, run: () => scrollUp() },
      { test: (_, k) => (k.ctrl || k.shift) && !!k.downArrow, run: () => scrollDown() },
      { test: (_, k) => k.shift && !!k.leftArrow, run: () => { if (tabs.length > 1) setActiveTab((prev: number) => (prev - 1 + tabs.length) % tabs.length); } },
      { test: (_, k) => k.shift && !!k.rightArrow, run: () => { if (tabs.length > 1) setActiveTab((prev: number) => (prev + 1) % tabs.length); } },
      { test: (ch, k) => !!k.leftArrow || (k.ctrl && ch === 'b'), run: () => setCursor((prev) => (prev > 0 ? prev - 1 : 0)) },
      { test: (ch, k) => !!k.rightArrow || (k.ctrl && ch === 'f'), run: () => setCursor((prev) => (prev < input.length ? prev + 1 : input.length)) },
      { test: (ch, k) => k.ctrl && ch === 'r', run: () => { if (frequentHistory.length > 0) { setHistoryPickerIdx(frequentHistory.length - 1); setHistoryPickerOpen(true); } } },
      { test: (ch, k) => k.ctrl && ch === 't', run: () => updateCurrentTab((tab) => ({ ...tab, toolStepsExpanded: !tab.toolStepsExpanded, scrollOffset: 0 })) },
      {
        test: (_, k) => !!k.upArrow,
        run: () => {
          updateCurrentTab((tab) => {
            if (tab.cmdHistory.length === 0) return tab;
            const idx = tab.cmdHistoryIdx === -1 ? tab.cmdHistory.length - 1 : Math.max(0, tab.cmdHistoryIdx - 1);
            setInput(tab.cmdHistory[idx]);
            setCursor(tab.cmdHistory[idx].length);
            return { ...tab, cmdHistoryIdx: idx };
          });
        },
      },
      {
        test: (_, k) => !!k.downArrow,
        run: () => {
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
        },
      },
      { test: (ch, k) => k.ctrl && ch === 'p', run: () => scrollUp() },
      { test: (ch, k) => k.ctrl && ch === 'n', run: () => scrollDown() },
      { test: (_, k) => !!k.pageUp, run: () => scrollUp() },
      { test: (_, k) => !!k.pageDown, run: () => scrollDown() },
      { test: (_, k) => !!k.escape, run: () => updateCurrentTab((tab) => ({ ...tab, scrollOffset: 0 })) },
      {
        test: (_, k) => !!k.tab,
        run: () => {
          const { newInput, newCursor, matches } = completeCommandLine(input, cursor, cwd, agents, connections);
          if (newInput !== input) {
            setInput(newInput);
            setCursor(newCursor);
          } else if (matches.length > 1) {
            updateCurrentTab((tab) => ({
              ...tab,
              log: [...tab.log, { input: '', output: matches.join('  ') }],
              scrollOffset: 0,
            }));
          }
        },
      },
    ];

    for (const b of normalBindings) {
      if (b.test(inputChar, key)) { b.run(); return; }
    }

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
