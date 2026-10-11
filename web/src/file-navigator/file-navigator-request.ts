import type { FileNavigatorMutationResults, FileNavigatorRpcCall } from '@shared/protocol';
import type { RequestResult } from '../shared/ws/rpc-exchange';
import type { JanusClient } from '../shared/ws/ws';

type MutationMethod = keyof FileNavigatorMutationResults;
type MutationCall<Method extends MutationMethod> = Extract<FileNavigatorRpcCall, { method: Method }>;

export function requestFileNavigatorMutation<Method extends MutationMethod>(
  client: JanusClient,
  call: MutationCall<Method>,
): Promise<RequestResult<FileNavigatorMutationResults[Method]>> {
  return client.request<FileNavigatorMutationResults[Method]>(call);
}
