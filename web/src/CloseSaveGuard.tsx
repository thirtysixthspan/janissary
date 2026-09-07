import React, { useEffect, useRef } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import type { DirtyTabHandle } from './tab-handles';
import { useSaveConfirm } from './SaveChangesDialog/useSaveConfirm';
import { SaveChangesDialog } from './SaveChangesDialog/SaveChangesDialog';

type Properties = {
  tabs: TabView[];
  tabHandles: React.RefObject<Map<string, DirtyTabHandle>>;
  client: JanusClient;
  guardRef: React.RefObject<((index: number) => boolean) | null>;
};

export function CloseSaveGuard({ tabs, tabHandles, client, guardRef }: Properties) {
  const {
    saveConfirmOpen, openSaveConfirm, closeSaveConfirm, labelRef, saving, startSave, isCurrentAttempt,
  } = useSaveConfirm();
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    guardRef.current = (index: number) => {
      const tab = tabsRef.current[index];
      if (!tab) return false;
      const handle = tabHandles.current.get(tab.label);
      if (handle?.isDirty()) { openSaveConfirm(tab.label); return true; }
      return false;
    };
    return () => { guardRef.current = null; };
  }, [tabHandles, openSaveConfirm, guardRef]);

  if (!saveConfirmOpen) return null;

  // The dialog was raised for one tab; everything below names that tab by label and resolves it
  // against the list as it stands at that moment, rather than reusing the position it held when the
  // dialog opened. A tab arriving or leaving in between — an agent opening one, a schedule firing, a
  // monitor's reporting tab — shifts every position after it.
  const targetHandle = () => tabHandles.current.get(labelRef.current);

  // `closeTab` still takes an index on the wire, so the index is computed here, immediately before
  // the send. A tab that is gone by now closes nothing rather than closing whatever took its place.
  const closeTarget = (label: string) => {
    const index = tabsRef.current.findIndex((tab) => tab.label === label);
    if (index === -1) return;
    client.send({ method: 'closeTab', params: { index } });
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
            closeSaveConfirm();
            handle.focus();
            return;
          }
        }
        if (!isCurrentAttempt(attempt)) return;
        closeSaveConfirm();
        closeTarget(attempt.label);
      }}
      onDiscard={() => {
        const label = labelRef.current;
        closeSaveConfirm();
        closeTarget(label);
      }}
      onCancel={() => {
        const handle = targetHandle();
        closeSaveConfirm();
        handle?.focus();
      }}
    />
  );
}
