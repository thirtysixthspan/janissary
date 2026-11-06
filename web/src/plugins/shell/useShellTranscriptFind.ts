import { useCallback, useState } from 'react';
import { useLineFind } from '../api';
import type { TranscriptLines } from './transcript-lines';

const EMPTY: TranscriptLines = { lines: [], rows: [] };

// The shell tab's transcript find: the editor's find state run over what the terminal shows. The
// transcript is read once, when the overlay opens, so the rows it lists stay where they were while
// the user steps through them even as the shell keeps printing.
export function useShellTranscriptFind(input: {
  active: boolean;
  transcript: () => TranscriptLines;
  revealRow: (row: number) => void;
}) {
  const { active, transcript, revealRow } = input;
  const [snapshot, setSnapshot] = useState<TranscriptLines>(EMPTY);
  const find = useLineFind(snapshot.lines, active);
  const { open: openFind, setSelected } = find;

  const open = useCallback((query = '') => {
    setSnapshot(transcript());
    openFind(query);
  }, [openFind, transcript]);

  const select = useCallback((index: number) => {
    setSelected(index);
    const result = find.results[index];
    const row = result === undefined ? undefined : snapshot.rows[result.index];
    if (row !== undefined) revealRow(row);
  }, [find.results, revealRow, setSelected, snapshot.rows]);

  return { ...find, open, select };
}
