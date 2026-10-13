import type { ConversationModelPair } from '@shared/plugins/conversations/shared';
import { pairFromValue } from './model-pairs';

type ConversationIntent = (name: string, payload: unknown) => Promise<unknown>;

export function createConversationActions(intent: ConversationIntent) {
  return {
    rename: (title: string) => intent('rename', { title }),
    send: (query: string) => intent('send', { query }),
    selectModel: (value: string) => {
      const pair: ConversationModelPair = pairFromValue(value);
      return intent('select-model', pair);
    },
    cancel: () => intent('cancel', {}),
    openFiles: () => intent('open-files', {}),
    launchShell: () => intent('launch-shell', {}),
    loadOlder: () => intent('load-older', {}),
  };
}
