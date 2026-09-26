import { useEffect, useRef, useState } from 'react';
import type { EditorView } from '@shared/protocol';
import { setSelection } from './model';
import type { EditorApi } from './useEditor';

export function useEditorLineJump(
  editor: EditorView,
  api: EditorApi,
  caretRef: React.RefObject<HTMLElement | null>,
): void {
  const handledRef = useRef(editor.lineRequest);
  const [jumps, setJumps] = useState(0);
  const loaded = api.state !== null;

  useEffect(() => {
    const state = api.stateRef.current;
    if (!state || handledRef.current === editor.lineRequest) return;
    handledRef.current = editor.lineRequest;
    if (editor.line === undefined) return;
    const target = { line: editor.line - 1, col: 0 };
    api.setState(setSelection(state, target, target));
    setJumps((count) => count + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a new request or the first load triggers the jump; the api's refs and setters are stable
  }, [editor.lineRequest, loaded]);

  useEffect(() => {
    if (jumps > 0) caretRef.current?.scrollIntoView({ block: 'center' });
  }, [jumps, caretRef]);
}
