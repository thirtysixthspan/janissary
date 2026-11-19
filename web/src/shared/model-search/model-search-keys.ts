import type React from 'react';
import { completeModel } from './model-search';

type KeyState = {
  open: boolean;
  highlighted: number | null;
  count: number;
  text: string;
  ids: string[];
};

type KeyActions = {
  open: () => void;
  close: () => void;
  highlight: (index: number) => void;
  changeText: (text: string) => void;
};

function tab(event: React.KeyboardEvent<HTMLInputElement>, state: KeyState, actions: KeyActions) {
  const completed = completeModel(state.ids, state.text);
  if (completed === null) {
    actions.close();
    return;
  }
  event.preventDefault();
  actions.changeText(completed);
  actions.open();
}

function arrow(event: React.KeyboardEvent<HTMLInputElement>, state: KeyState, actions: KeyActions) {
  event.preventDefault();
  if (!state.open) {
    actions.open();
    return;
  }
  if (state.count === 0) return;
  if (state.highlighted === null) {
    actions.highlight(0);
    return;
  }
  const next = event.key === 'ArrowUp' ? state.highlighted - 1 : state.highlighted + 1;
  actions.highlight(Math.max(0, Math.min(state.count - 1, next)));
}

export function handleModelSearchKey(event: React.KeyboardEvent<HTMLInputElement>, state: KeyState, actions: KeyActions): void {
  if (event.nativeEvent.isComposing) return;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key === 'Tab') {
    tab(event, state, actions);
    return;
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') arrow(event, state, actions);
}
