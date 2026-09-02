import React, { useEffect, useRef, useState } from 'react';
import type { ChatTabPayload, ChatTurn } from '@shared/plugins/chat/shared';
import { renderMarkdown, type TabPluginClientCapabilities } from '../api';

function pairValue(harness: string, model: string): string {
  return `${harness}:${model}`;
}

export function ChatTab({
  payload,
  capabilities,
}: {
  payload: ChatTabPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const { conversation, models } = payload;
  const [query, setQuery] = useState('');
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

  const send = () => {
    if (!query.trim() || streaming || conversation.deleted) return;
    void capabilities.intent('send', { query });
    setQuery('');
  };

  const groups = (['claude', 'opencode'] as const).map((harness) => ({
    harness,
    models: models.filter((pair) => pair.harness === harness),
  })).filter((group) => group.models.length > 0);

  return (
    <div className="chat-tab plugin-tab">
      <div className="plugin-meta chat-header">
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
        {capabilities.splitAction && <span className="plugin-actions">{capabilities.splitAction}</span>}
      </div>
      <div
        className="chat-turns"
        ref={turnsRef}
        onScroll={(event) => {
          if (event.currentTarget.scrollTop === 0 && conversation.hasOlder) {
            void capabilities.intent('load-older', {});
          }
        }}
      >
        {conversation.turns.map((turn, index) => {
          return (
            <div className="chat-turn" key={`${String(index)}:${turn.query}`}>
              <div className="chat-query">{turn.query}</div>
              <div className={`chat-response${turn.error ? ' failed' : ''}`}>
                <TurnResponse turn={turn} />
              </div>
              <div className="chat-pair">{pairValue(turn.pair.harness, turn.pair.model)}</div>
            </div>
          );
        })}
      </div>
      {conversation.deleted && <div className="chat-deleted">This conversation was deleted.</div>}
      <div className="chat-composer">
        <textarea
          aria-label="Message"
          value={query}
          disabled={conversation.deleted}
          onChange={(event) => { setQuery(event.target.value); }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            send();
          }}
        />
        <button type="button" disabled={!query.trim() || streaming || conversation.deleted} onClick={send}>
          Send
        </button>
      </div>
    </div>
  );
}

function TurnResponse({ turn }: { turn: ChatTurn }) {
  if (turn.error) return turn.error;
  const html = renderMarkdown(turn.response);
  return html === undefined
    ? turn.response
    : <div dangerouslySetInnerHTML={{ __html: html }} />;
}
