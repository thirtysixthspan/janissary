import { useCallback, useRef, type RefObject } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';
import type { DirtyTabHandle } from '../shared/tab/handles';
import { tabFullName } from '../shared/tab/tab-name';
import { nextWalkLabel, walkTitle } from './save-walk';
import type { SaveConfirmRequest } from './useSaveConfirm';

type Properties = {
  tabs: readonly TabView[];
  tabHandles: RefObject<Map<string, DirtyTabHandle>>;
  client: JanusClient;
  onQuit: () => void;
  revealDocked: (label: string) => boolean;
  saveWalkOpenRef: RefObject<boolean>;
  request: SaveConfirmRequest | null;
  startSave: () => { label: string; generation: number } | undefined;
  isCurrentAttempt: (attempt: { generation: number }) => boolean;
  openQuitWalk: (label: string) => void;
  advanceQuitWalk: (nextLabel: string) => void;
  dismiss: () => void;
};

// The quit walk: one save-changes dialog per dirty tab, in tab-strip order. Every handler reads the
// live tab list and handle map at press time, and every result is checked against the request it
// belongs to, because the list can change and a dialog can be replaced while a save is pending.
export function useQuitWalk({
  tabs, tabHandles, client, onQuit, revealDocked, saveWalkOpenRef,
  request, startSave, isCurrentAttempt, openQuitWalk, advanceQuitWalk, dismiss,
}: Properties) {
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const requestRef = useRef(request);
  requestRef.current = request;

  const isDirty = useCallback(
    (label: string) => tabHandles.current.get(label)?.isDirty() === true,
    [tabHandles],
  );
  const isPresent = useCallback(
    (label: string) => tabsRef.current.some((tab) => tab.label === label),
    [],
  );
  const reveal = useCallback((label: string) => {
    if (!revealDocked(label)) client.send({ method: 'focusTab', params: { label } });
  }, [client, revealDocked]);

  const advance = useCallback(() => {
    const current = requestRef.current;
    if (current?.kind !== 'quit') return;
    const answered = new Set(current.answered);
    answered.add(current.label);
    const next = nextWalkLabel(tabsRef.current, isDirty, answered);
    if (next === undefined) {
      saveWalkOpenRef.current = false;
      dismiss();
      onQuit();
      return;
    }
    reveal(next);
    advanceQuitWalk(next);
  }, [advanceQuitWalk, dismiss, isDirty, onQuit, reveal, saveWalkOpenRef]);

  const start = useCallback(() => {
    if (saveWalkOpenRef.current || requestRef.current !== null) return true;
    const first = nextWalkLabel(tabsRef.current, isDirty, new Set());
    if (first === undefined) return false;
    saveWalkOpenRef.current = true;
    reveal(first);
    openQuitWalk(first);
    return true;
  }, [isDirty, openQuitWalk, reveal, saveWalkOpenRef]);

  const save = useCallback(async () => {
    const current = requestRef.current;
    if (current?.kind !== 'quit') return;
    const handle = tabHandles.current.get(current.label);
    if (!isPresent(current.label) || !handle) {
      advance();
      return;
    }
    const attempt = startSave();
    if (!attempt) return;
    const attemptHandle = tabHandles.current.get(attempt.label);
    if (!attemptHandle) {
      advance();
      return;
    }
    try {
      await attemptHandle.save();
    } catch {
      if (!isCurrentAttempt(attempt)) return;
      saveWalkOpenRef.current = false;
      dismiss();
      attemptHandle.focus();
      return;
    }
    if (!isCurrentAttempt(attempt)) return;
    advance();
  }, [advance, dismiss, isCurrentAttempt, isPresent, saveWalkOpenRef, startSave, tabHandles]);

  const discard = useCallback(() => {
    if (requestRef.current?.kind !== 'quit') return;
    advance();
  }, [advance]);

  const cancel = useCallback(() => {
    const current = requestRef.current;
    if (current?.kind !== 'quit') return;
    const handle = tabHandles.current.get(current.label);
    if (!isPresent(current.label) || !handle) {
      advance();
      return;
    }
    saveWalkOpenRef.current = false;
    dismiss();
    handle.focus();
  }, [advance, dismiss, isPresent, saveWalkOpenRef, tabHandles]);

  const quitTab = request?.kind === 'quit'
    ? tabs.find((tab) => tab.label === request.label)
    : undefined;
  const title = request?.kind === 'quit'
    ? walkTitle(quitTab ? tabFullName(quitTab) : request.label)
    : undefined;

  return { start, save, discard, cancel, title };
}
