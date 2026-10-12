import { useRef } from 'react';
import type { BufferLine } from '@shared/protocol';
import { Transcript } from '../shared/transcript/Transcript';
import type { TranscriptIntents } from '../shared/transcript/transcript-intents';
import type { PtyActions } from '../shared/terminal/pty-actions';

const NO_INTENTS: TranscriptIntents = {
  onOpenFile: () => {},
  onEditFile: () => {},
  onFocusTab: () => {},
};
const NO_PTY_ACTIONS: PtyActions = {
  attach: () => () => {}, input: () => {}, resize: () => {}, reportColors: () => {}, kill: () => {},
};

export function ReadOnlyTranscript({ lines }: { lines: BufferLine[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <Transcript
      lines={lines}
      intents={NO_INTENTS}
      ptyActions={NO_PTY_ACTIONS}
      onToggleCollapse={() => {}}
      onPromptClick={() => {}}
      scrollRef={scrollRef}
      showEmptyHint={false}
    />
  );
}
