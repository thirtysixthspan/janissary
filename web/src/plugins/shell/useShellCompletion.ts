import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { handlePickerKey } from '../api';
import type { TabPluginClientCapabilities } from '../api';
import type { ShellCompletion } from '@shared/plugins/shell/shared';
import { completionPickLine } from './completion-pick';
import { reportShellIntentFailure } from './report-shell-intent-failure';

type Input = {
  capabilities: TabPluginClientCapabilities;
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
};

const PICKER_KEYS: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'Enter', 'Escape']);

export function useShellCompletion({ capabilities, draft, setDraft, inputRef }: Input) {
  const [matches, setMatches] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const cursorReference = useRef(0);

  const ask = useCallback(
    (line: string, cursor: number) => capabilities.intent<ShellCompletion>('complete', { line, cursor }),
    [capabilities],
  );
  const fail = useCallback((error: unknown) => {
    reportShellIntentFailure(capabilities, 'shell completion intent failed', error);
  }, [capabilities]);

  const request = useCallback((line: string, cursor: number) => {
    void ask(line, cursor).then((result) => {
      cursorReference.current = result.newCursor;
      setSelected(0);
      setMatches(result.matches);
      if (result.matches.length > 0) setDraft(result.newInput);
    }).catch(fail);
  }, [ask, fail, setDraft]);

  const pick = useCallback((match: string) => {
    const picked = completionPickLine(draft, cursorReference.current, match);
    setMatches([]);
    setDraft(picked.line);
    inputRef.current?.focus();
    if (match.endsWith('/')) return;
    void ask(picked.line, picked.cursor).then((result) => {
      if (result.matches.length !== 1) return;
      setDraft((current) => (current === picked.line ? result.newInput : current));
    }).catch(fail);
  }, [ask, draft, fail, inputRef, setDraft]);

  const onPickerKey = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (matches.length < 2 || !PICKER_KEYS.has(event.key)) return false;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    return handlePickerKey(event.nativeEvent, matches, selected, setSelected, pick, () => { setMatches([]); });
  }, [matches, pick, selected]);

  return { matches, selected, setMatches, request, pick, onPickerKey };
}
