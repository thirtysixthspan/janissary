import type { ProviderRecord } from './providers/result.js';

const NON_CONVERSATIONAL = /embedding|-tts|transcribe|-live|-image$|^veo|\/veo|lyria/;

export function isConversationalModel(id: string): boolean {
  return !NON_CONVERSATIONAL.test(id);
}

export function conversationalRecords(records: ProviderRecord[]): ProviderRecord[] {
  return records.filter(({ id }) => isConversationalModel(id));
}
