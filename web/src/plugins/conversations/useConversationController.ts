import { useCallback, useEffect, useMemo } from 'react';
import type { ConversationTabPayload } from '@shared/plugins/conversations/shared';
import type { TabPluginClientCapabilities } from '../api';
import { createConversationActions } from './conversation-actions';

export function useConversationController(
  payload: ConversationTabPayload,
  capabilities: TabPluginClientCapabilities,
) {
  const actions = useMemo(
    () => createConversationActions(capabilities.intent),
    [capabilities.intent],
  );
  const streaming = payload.conversation.turns.some((turn) => turn.streaming === true);

  useEffect(() => {
    if (!capabilities.active || !streaming) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      void actions.cancel();
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => { globalThis.removeEventListener('keydown', onKeyDown); };
  }, [actions, capabilities.active, streaming]);

  const loadOlder = useCallback(() => {
    if (payload.conversation.hasOlder) void actions.loadOlder();
  }, [actions, payload.conversation.hasOlder]);

  return { ...actions, loadOlder };
}
