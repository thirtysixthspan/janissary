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
  accept: () => void;
  submit: () => void;
};

function tab(event: React.KeyboardEvent<HTMLInputElement>, state: KeyState, actions: KeyActions) {
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
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
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
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

function returnKey(event: React.KeyboardEvent<HTMLInputElement>, state: KeyState, actions: KeyActions) {
  if (state.highlighted !== null) {
    event.preventDefault();
    event.stopPropagation();
    actions.accept();
    return;
  }
  actions.submit();
}

function escapeKey(event: React.KeyboardEvent<HTMLInputElement>, state: KeyState, actions: KeyActions) {
  if (!state.open) return;
  event.preventDefault();
  event.stopPropagation();
  actions.close();
}

export function handleModelSearchKey(event: React.KeyboardEvent<HTMLInputElement>, state: KeyState, actions: KeyActions): void {
  if (event.nativeEvent.isComposing) return;
  if (event.key === 'Tab') {
    tab(event, state, actions);
    return;
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    arrow(event, state, actions);
    return;
  }
  if (event.key === 'Enter') {
    returnKey(event, state, actions);
    return;
  }
  if (event.key === 'Escape') escapeKey(event, state, actions);
}
