import React, { useMemo, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faPlus } from '@fortawesome/free-solid-svg-icons';
import type { ConversationTabPayload, ConversationTurn } from '@shared/plugins/conversations/shared';
import { renderMarkdown, type TabPluginClientCapabilities } from '../api';
import { ConversationComposer } from './ConversationComposer';
import { ConversationTitle } from './ConversationTitle';
import { modelGroups, pairValue } from './model-pairs';
import { useConversationController } from './useConversationController';
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
  const controller = useConversationController(payload, capabilities);
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

  // The selection a conversation opened with — `Chat about this`. It renders as a user turn the
  // model never answered, and stays in the conversation after queries are sent; the first send
  // carries it to the model as context, and closing or reopening its tab loses it.
  const draft = payload.draftQuery;

  const groups = modelGroups(models);

  return (
    <div className="conversation-tab plugin-tab" data-doc-shot="conversation-view">
      <div className="plugin-meta conversation-header">
        <ConversationTitle
          title={conversation.title}
          deleted={conversation.deleted === true}
          onRename={(title) => { void controller.rename(title); }}
        />
        <span className="plugin-actions">
          <select
            aria-label="Model"
            value={pairValue(conversation.pair.harness, conversation.pair.model)}
            disabled={streaming || conversation.deleted}
            onChange={(event) => { void controller.selectModel(event.target.value); }}
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
            onClick={() => { void controller.openFiles(); }}
          >
            <FontAwesomeIcon icon={faFolder} />
          </button>
          <button
            type="button"
            title="New shell in this workspace"
            disabled={conversation.deleted}
            onClick={() => { void controller.launchShell(); }}
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
          if (event.currentTarget.scrollTop === 0) controller.loadOlder();
        }}
      >
        {draft !== undefined && (
          <div className="conversation-turn conversation-draft">
            <div className="conversation-query">{draft}</div>
          </div>
        )}
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
        onSend={(query) => { void controller.send(query); }}
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
