import React, { useEffect, useMemo, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faPlus } from '@fortawesome/free-solid-svg-icons';
import type { ConversationTabPayload, ConversationTurn } from '@shared/plugins/conversations/shared';
import { renderMarkdown, type TabPluginClientCapabilities } from '../api';
import { ConversationComposer } from './ConversationComposer';
import { ConversationTitle } from './ConversationTitle';
import { modelGroups, pairValue } from './model-pairs';
import { useStickToBottom } from './useStickToBottom';

export function ConversationTab({
  payload,
  capabilities,
}: {
  payload: ConversationTabPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const { conversation, models } = payload;
  const streaming = conversation.turns.some((turn) => turn.streaming === true);
  const turnsRef = useRef<HTMLDivElement>(null);
  const latestTurn = conversation.turns.at(-1);
  const latestQuery = latestTurn?.query;
  const latestResponse = latestTurn?.response;
  const latestError = latestTurn?.error;
  const latestStreaming = latestTurn?.streaming;
  // A tuple over the values the pin effect re-runs on: memoized so its identity changes only when
  // one of the members does, which is what the hook's single dependency keys off.
  const rePinKey = useMemo(
    () => [conversation.id, latestError, latestQuery, latestResponse, latestStreaming],
    [conversation.id, latestError, latestQuery, latestResponse, latestStreaming],
  );
  const { onScroll: onTurnsScroll } = useStickToBottom(turnsRef, capabilities.active, rePinKey);

  useEffect(() => {
    if (!capabilities.active || !streaming) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      void capabilities.intent('cancel', {});
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => { globalThis.removeEventListener('keydown', onKeyDown); };
  }, [capabilities, streaming]);

  const groups = modelGroups(models);

  return (
    <div className="conversation-tab plugin-tab" data-doc-shot="conversation-view">
      <div className="plugin-meta conversation-header">
        <ConversationTitle
          title={conversation.title}
          deleted={conversation.deleted === true}
          onRename={(title) => { void capabilities.intent('rename', { title }); }}
        />
        <span className="plugin-actions">
          <select
            aria-label="Model"
            value={pairValue(conversation.pair.harness, conversation.pair.model)}
            disabled={streaming || conversation.deleted}
            onChange={(event) => {
              const separator = event.target.value.indexOf(':');
              const harness = event.target.value.slice(0, separator) as 'claude' | 'opencode';
              const model = event.target.value.slice(separator + 1);
              void capabilities.intent('select-model', { harness, model });
            }}
          >
            {groups.map((group) => (
              <optgroup key={group.harness} label={group.harness}>
                {group.models.map((pair) => (
                  <option key={pairValue(pair.harness, pair.model)} value={pairValue(pair.harness, pair.model)}>
                    {pair.model}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            title="Open file navigator in this workspace"
            disabled={conversation.deleted}
            onClick={() => { void capabilities.intent('open-files', {}); }}
          >
            <FontAwesomeIcon icon={faFolder} />
          </button>
          <button
            type="button"
            title="New agent in this workspace"
            disabled={conversation.deleted}
            onClick={() => { void capabilities.intent('launch-agent', {}); }}
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
          {capabilities.splitAction}
        </span>
      </div>
      <div
        className="conversation-turns"
        ref={turnsRef}
        onScroll={(event) => {
          onTurnsScroll(event.currentTarget);
          if (event.currentTarget.scrollTop === 0 && conversation.hasOlder) {
            void capabilities.intent('load-older', {});
          }
        }}
      >
        {conversation.turns.map((turn, index) => {
          return (
            <div className="conversation-turn" key={`${String(index)}:${turn.query}`}>
              <div className="conversation-query">{turn.query}</div>
              <div className={`conversation-response${turn.error ? ' failed' : ''}`}>
                <TurnResponse turn={turn} />
              </div>
              <div className="conversation-pair">{pairValue(turn.pair.harness, turn.pair.model)}</div>
            </div>
          );
        })}
      </div>
      {conversation.deleted && <div className="conversation-deleted">This conversation was deleted.</div>}
      <ConversationComposer
        history={conversation.turns.map((turn) => turn.query)}
        streaming={streaming}
        deleted={conversation.deleted === true}
        active={capabilities.active}
        initialQuery={payload.draftQuery}
        onConsumeDraft={() => { void capabilities.intent('consume-draft', {}); }}
        onSend={(query) => { void capabilities.intent('send', { query }); }}
      />
    </div>
  );
}

function TurnResponse({ turn }: { turn: ConversationTurn }) {
  if (turn.error) return turn.error;
  const html = renderMarkdown(turn.response);
  return html === undefined
    ? turn.response
    : <div dangerouslySetInnerHTML={{ __html: html }} />;
}
