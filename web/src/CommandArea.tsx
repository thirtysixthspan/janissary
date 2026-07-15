import React from 'react';
import type { BufferLine } from '@shared/protocol';
import { CommandInput, type CommandInputProperties } from './CommandInput';
import { SearchBar } from './SearchBar';
import type { useTranscriptSearch } from './useTranscriptSearch';

type Properties = {
  search: ReturnType<typeof useTranscriptSearch>;
  lines: BufferLine[];
} & CommandInputProperties;

// Replaces the command bar with the search bar while search mode is open — visually, the
// command bar "becomes" the search bar rather than something appearing alongside it.
export function CommandArea({
  search, lines, dotColor, history, ghostHistory, onSubmit, inputRef, complete, pickerOpen, busy,
  queueOpen, recallRef, onEditQueued, onDeleteQueued, dropRef,
}: Properties) {
  if (search.searchOpen) {
    return (
      <SearchBar
        pattern={search.pattern}
        status={search.status}
        position={search.position}
        currentText={search.currentLineIndex === null ? null : lines[search.currentLineIndex]?.text ?? null}
        onChange={search.setPattern}
        onStepOlder={search.stepOlder}
        onStepNewer={search.stepNewer}
        onClose={search.close}
        commandInputRef={inputRef}
      />
    );
  }
  return (
    <CommandInput
      dotColor={dotColor}
      history={history}
      ghostHistory={ghostHistory}
      onSubmit={onSubmit}
      inputRef={inputRef}
      complete={complete}
      pickerOpen={pickerOpen}
      busy={busy}
      queueOpen={queueOpen}
      recallRef={recallRef}
      onEditQueued={onEditQueued}
      onDeleteQueued={onDeleteQueued}
      dropRef={dropRef}
    />
  );
}
