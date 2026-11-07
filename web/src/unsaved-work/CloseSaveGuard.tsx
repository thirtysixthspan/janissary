import React, { useEffect, useRef } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../shared/ws/ws';
import type { DirtyTabHandle } from '../shared/tab/handles';
import { useSaveConfirm } from './useSaveConfirm';
import { useQuitWalk } from './useQuitWalk';
import { SaveChangesDialog } from './SaveChangesDialog';

type Properties = {
  tabs: TabView[];
  tabHandles: React.RefObject<Map<string, DirtyTabHandle>>;
  client: JanusClient;
  guardRef: React.RefObject<((index: number) => boolean) | null>;
  quitWalkRef?: React.RefObject<(() => boolean) | null>;
  saveWalkOpenRef?: React.RefObject<boolean>;
  onQuit?: () => void;
  revealDocked?: (label: string) => boolean;
};

const noQuit = () => {};
const nothingDocked = () => false;

export function CloseSaveGuard({
  tabs, tabHandles, client, guardRef,
  quitWalkRef, saveWalkOpenRef, onQuit = noQuit, revealDocked = nothingDocked,
}: Properties) {
  const {
    request, saveConfirmOpen, openClose, dismiss, labelRef, saving, startSave, isCurrentAttempt,
    openQuitWalk, advanceQuitWalk, select,
  } = useSaveConfirm();
  const localWalkOpenRef = useRef(false);
  const effectiveWalkOpenRef = saveWalkOpenRef ?? localWalkOpenRef;
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const { start: startQuitWalk, save, discard, cancel, title } = useQuitWalk({
    tabs, tabHandles, client, onQuit, revealDocked, saveWalkOpenRef: effectiveWalkOpenRef,
    request, startSave, isCurrentAttempt, openQuitWalk, advanceQuitWalk, dismiss,
  });

  useEffect(() => {
    guardRef.current = (index: number) => {
      const tab = tabsRef.current[index];
      if (!tab) return false;
      const handle = tabHandles.current.get(tab.label);
      if (handle?.isDirty()) {
        effectiveWalkOpenRef.current = false;
        openClose(tab.label);
        return true;
      }
      return false;
    };
    return () => { guardRef.current = null; };
  }, [tabHandles, openClose, guardRef, effectiveWalkOpenRef]);

  useEffect(() => {
    if (!quitWalkRef) return;
    quitWalkRef.current = startQuitWalk;
    return () => { quitWalkRef.current = null; };
  }, [quitWalkRef, startQuitWalk]);

  if (!saveConfirmOpen || request === null) return null;

  if (request.kind === 'quit') {
    return (
      <SaveChangesDialog
        key={request.label}
        title={title}
        selected={request.selection}
        onSelect={select}
        className="save-walk-dialog"
        saving={saving}
        onSave={save}
        onDiscard={discard}
        onCancel={cancel}
      />
    );
  }

  // The dialog was raised for one tab; everything below names that tab by label and resolves it
  // against the list as it stands at that moment, rather than reusing the position it held when the
  // dialog opened. A tab arriving or leaving in between — an agent opening one, a schedule firing, a
  // monitor's reporting tab — shifts every position after it.
  const targetHandle = () => tabHandles.current.get(labelRef.current);

  // `closeTab` names the tab by label and the server resolves it on receipt, so a tab that is gone
  // by then closes nothing rather than closing whatever took its place.
  const closeTarget = (label: string) => {
    client.send({ method: 'closeTab', params: { label } });
  };

  return (
    <SaveChangesDialog
      saving={saving}
      onSave={async () => {
        const attempt = startSave();
        if (!attempt) return;
        const handle = tabHandles.current.get(attempt.label);
        if (handle) {
          try {
            await handle.save();
          } catch {
            if (!isCurrentAttempt(attempt)) return;
            // The work is still unsaved (see `DirtyTabHandle`), so the tab stays. This dialog is
            // dismissed rather than held open because it is modal: whatever the surface raised in
            // its place — a save error, an overwrite prompt — is only reachable once it is gone.
            dismiss();
            handle.focus();
            return;
          }
        }
        if (!isCurrentAttempt(attempt)) return;
        dismiss();
        closeTarget(attempt.label);
      }}
      onDiscard={() => {
        const label = labelRef.current;
        dismiss();
        closeTarget(label);
      }}
      onCancel={() => {
        const handle = targetHandle();
        dismiss();
        handle?.focus();
      }}
    />
  );
}
