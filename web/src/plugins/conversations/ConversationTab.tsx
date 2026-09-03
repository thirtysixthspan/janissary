import React, { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faPlus } from '@fortawesome/free-solid-svg-icons';
import type { ConversationTabPayload, ConversationTurn } from '@shared/plugins/conversations/shared';
import { renderMarkdown, type TabPluginClientCapabilities } from '../api';
import { ConversationComposer } from './ConversationComposer';

function pairValue(harness: string, model: string): string {
  return `${harness}:${model}`;
}

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

  useEffect(() => {
    const element = turnsRef.current;
    if (!capabilities.active || !element) return;
    element.scrollTop = element.scrollHeight;
  }, [
    capabilities.active,
    conversation.id,
    latestError,
    latestQuery,
    latestResponse,
    latestStreaming,
  ]);

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

  const groups = (['claude', 'opencode'] as const).map((harness) => ({
    harness,
    models: models.filter((pair) => pair.harness === harness),
  })).filter((group) => group.models.length > 0);

  return (
    <div className="conversation-tab plugin-tab">
      <div className="plugin-meta conversation-header">
        <span className="plugin-name">{conversation.title}</span>
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
        <span className="plugin-actions">
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
