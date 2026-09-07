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
  const { saveConfirmOpen, openSaveConfirm, closeSaveConfirm, indexRef } = useSaveConfirm();
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    guardRef.current = (index: number) => {
      const tab = tabsRef.current[index];
      if (!tab) return false;
      const handle = tabHandles.current.get(tab.label);
      if (handle?.isDirty()) { openSaveConfirm(index); return true; }
      return false;
    };
  }, [tabHandles, openSaveConfirm, guardRef]);

  if (!saveConfirmOpen) return null;

  return (
    <SaveChangesDialog
      onSave={async () => {
        const idx = indexRef.current;
        const tab = tabsRef.current[idx];
        const handle = tab ? tabHandles.current.get(tab.label) : undefined;
        if (handle) {
          try {
            await handle.save();
          } catch {
            // The work is still unsaved (see `DirtyTabHandle`), so the tab stays. This dialog is
            // dismissed rather than held open because it is modal: whatever the surface raised in
            // its place — a save error, an overwrite prompt — is only reachable once it is gone.
            closeSaveConfirm();
            handle.focus();
            return;
          }
        }
        closeSaveConfirm();
        client.send({ method: 'closeTab', params: { index: idx } });
      }}
      onDiscard={() => {
        const idx = indexRef.current;
        closeSaveConfirm();
        client.send({ method: 'closeTab', params: { index: idx } });
      }}
      onCancel={() => {
        const idx = indexRef.current;
        const tab = tabsRef.current[idx];
        const handle = tab ? tabHandles.current.get(tab.label) : undefined;
        closeSaveConfirm();
        handle?.focus();
      }}
    />
  );
}
