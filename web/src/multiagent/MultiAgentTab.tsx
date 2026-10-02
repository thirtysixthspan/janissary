import React from 'react';
import type { MultiAgentView } from '@shared/protocol';
import { runSummary } from './format';
import { useMemberAnswers } from './useMemberAnswers';
import { MemberRow } from './MemberRow';

// The multi-agent tab's body: the one prompt every member received, once, above a row per member.
//
// Deliberately not a command bar or a transcript. A run is one command, one prompt, one set of
// members, and closing the tab is the whole teardown — so the body shows the comparison and offers
// nothing to type into.
export function MultiAgentTab({ view }: { view: MultiAgentView }) {
  const answers = useMemberAnswers(view.members);
  return (
    <div className="multiagent-tab">
      <div className="multiagent-prompt">{view.prompt}</div>
      <div className="multiagent-summary">{runSummary(view.members, view.cloning)}</div>
      <div className="multiagent-members">
        {view.members.map((member) => (
          <MemberRow key={member.index} member={member} html={answers.get(member.index)} />
        ))}
      </div>
    </div>
  );
}
