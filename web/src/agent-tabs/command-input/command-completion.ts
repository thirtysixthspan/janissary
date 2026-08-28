import type { RefObject } from 'react';
import type { CompletionResult } from '@shared/protocol';

export function handleTabCompletion(
  value: string,
  cursor: number,
  complete: (text: string, cursor: number) => Promise<CompletionResult>,
  setValue: (value: string) => void,
  setCompletions: (completions: string[]) => void,
  inputRef: RefObject<HTMLTextAreaElement | null>,
): void {
  const before = value.slice(0, cursor);
  const token = before.slice(Math.max(before.lastIndexOf(' '), before.lastIndexOf('\t'), before.lastIndexOf('\n')) + 1);
  if (token.length === 0) { setCompletions([]); return; }
  void complete(value, cursor).then((res) => {
    setValue(res.newInput);
    setCompletions(res.matches.length > 1 ? res.matches : []);
    requestAnimationFrame(() => {
      const element = inputRef.current;
      if (element) element.selectionStart = element.selectionEnd = res.newCursor;
    });
  });
}
