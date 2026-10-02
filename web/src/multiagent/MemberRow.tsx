import React from 'react';
import type { MultiAgentMemberView } from '@shared/protocol';
import { stateWord } from './format';

// One member of the comparison: its model, the word for what it is doing, and then either its answer
// as markdown or the reason there is none. A member that is still working renders its word and
// nothing else — the answer arrives whole, when it lands.
export function MemberRow({
  member, html,
}: { member: MultiAgentMemberView; html: string | undefined }) {
  return (
    <div className="multiagent-member">
      <div className="multiagent-member-head">
        <span className="multiagent-model">{member.model}</span>
        <span className={`multiagent-state ${member.state}`}>{stateWord(member.state)}</span>
      </div>
      {member.state === 'failed' && member.error && (
        <div className="multiagent-error">{member.error}</div>
      )}
      {member.state === 'answered' && html !== undefined && (
        <div className="multiagent-answer line markdown" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}
