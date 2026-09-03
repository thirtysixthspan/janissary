import { useCallback } from 'react';
import type { FileNavigatorDetail } from '@shared/protocol';
import type { JanusClient } from '../ws';

export function useFileNavigatorIntents(client: JanusClient, index: number) {
  const sendCommand = useCallback((text: string) => {
    client.send({ method: 'command', params: { text } });
  }, [client]);

  const toggle = useCallback((path: string) => {
    client.send({ method: 'fileNavigatorToggle', params: { index, path } });
  }, [client, index]);

  const reroot = useCallback(() => {
    client.send({ method: 'fileNavigatorReroot', params: { index } });
  }, [client, index]);

  const rerootTo = useCallback((path: string) => {
    client.send({ method: 'fileNavigatorReroot', params: { index, path } });
  }, [client, index]);

  const setDock = useCallback((dock: 'left' | 'right') => {
    client.send({ method: 'setDock', params: { index, dock } });
  }, [client, index]);

  const setDetail = useCallback((details: FileNavigatorDetail) => {
    client.send({ method: 'fileNavigatorSetDetail', params: { index, details } });
  }, [client, index]);

  const collapseAll = useCallback(() => {
    client.send({ method: 'fileNavigatorCollapseAll', params: { index } });
  }, [client, index]);

  const pull = useCallback(() => {
    client.send({ method: 'fileNavigatorPull', params: { index } });
  }, [client, index]);

  const openGithub = useCallback((githubUrl: string) => {
    sendCommand(`open ${githubUrl}`);
  }, [sendCommand]);

  return { sendCommand, toggle, reroot, rerootTo, setDock, setDetail, collapseAll, pull, openGithub };
}
