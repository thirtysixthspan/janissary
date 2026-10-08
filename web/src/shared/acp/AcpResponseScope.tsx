import { createContext, useContext, type ReactNode } from 'react';
import type { TabView } from '@shared/protocol';
import type { JanusClient } from '../../ws';
import { AcpResponsePanel } from './AcpResponsePanel';
import { QuestionPanel } from '../questions/QuestionPanel';

const AcpResponseContext = createContext<ReactNode>(null);

export function AcpResponseScope({ response, question, label, client, children }: {
  response: TabView['acpResponse'];
  question?: TabView['pendingQuestion'];
  label: string;
  client: JanusClient;
  children: ReactNode;
}) {
  return (
    <AcpResponseContext.Provider value={response ? <>
      <AcpResponsePanel response={response} label={label} client={client} />
      {question && <QuestionPanel question={question} client={client} />}
    </> : null}>
      {children}
    </AcpResponseContext.Provider>
  );
}

// A plugin receives only its host-rendered response surface, never another tab's data or client.
export function useAcpResponse(): ReactNode {
  return useContext(AcpResponseContext);
}
