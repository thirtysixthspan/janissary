import { parseRemoteAddress, type RemoteAddress } from '../remote/address.js';
import type { RemoteSessionRecord } from './store.js';

export function addressFromSessionRecord(record: RemoteSessionRecord): RemoteAddress | { error: string } {
  const parsed = parseRemoteAddress(record.address);
  if ('error' in parsed) return parsed;
  return {
    ...parsed,
    ...(record.port !== undefined && { port: record.port }),
    ...(record.hostName !== undefined && { hostName: record.hostName }),
  };
}
