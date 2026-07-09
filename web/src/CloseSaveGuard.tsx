import React, { useEffect, useRef } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from './ws';
import type { EditorTabHandle } from './EditorTab';
import { useSaveConfirm } from './SaveChangesDialog/useSaveConfirm';
import { SaveChangesDialog } from './SaveChangesDialog/SaveChangesDialog';

type Properties = {
  tabs: TabView[];
  editorHandles: React.RefObject<Map<string, EditorTabHandle>>;
  client: JanusClient;
  guardRef: React.RefObject<((index: number) => boolean) | null>;
};

export function CloseSaveGuard({ tabs, editorHandles, client, guardRef }: Properties) {
  const { saveConfirmOpen, openSaveConfirm, closeSaveConfirm, indexRef } = useSaveConfirm();
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  useEffect(() => {
    guardRef.current = (index: number) => {
      const tab = tabsRef.current[index];
      if (!tab) return false;
      const handle = editorHandles.current.get(tab.label);
      if (handle?.isDirty()) { openSaveConfirm(index); return true; }
      return false;
    };
  }, [editorHandles, openSaveConfirm, guardRef]);

  if (!saveConfirmOpen) return null;

  return (
    <SaveChangesDialog
      onSave={async () => {
        const idx = indexRef.current;
        const tab = tabsRef.current[idx];
        const handle = tab ? editorHandles.current.get(tab.label) : undefined;
        if (handle) await handle.save();
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
        const handle = tab ? editorHandles.current.get(tab.label) : undefined;
        closeSaveConfirm();
        handle?.focus();
      }}
    />
  );
}
