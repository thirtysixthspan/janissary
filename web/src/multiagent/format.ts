import type { MultiAgentMemberState, MultiAgentMemberView } from '@shared/protocol';

// The words a member's row reads. A working member shows its state and nothing else — that is what
// keeps the payload small — and its answer appears whole, when it lands.
const STATE_WORDS: Record<MultiAgentMemberState, string> = {
  cloning: 'cloning its workspace',
  running: 'working',
  answered: 'answered',
  failed: 'failed',
};

// The word shown beside a member's model.
export function stateWord(state: MultiAgentMemberState): string {
  return STATE_WORDS[state];
}

// Whether the row has anything to show beyond its state: an answer, or the reason there is none.
export function hasResult(member: MultiAgentMemberView): boolean {
  return member.state === 'answered' || member.state === 'failed';
}

// The line above the rows: how many of the run have answered, and how many are still cloning. A
// member that failed counts in the total and reads `failed` with its reason on its own row, so the
// summary never has to distinguish a refused member from one whose connection died.
export function runSummary(members: MultiAgentMemberView[], cloning: number): string {
  const answered = members.filter((m) => m.state === 'answered').length;
  const parts = [`${answered} of ${members.length} answered`];
  if (cloning > 0) parts.push(`${cloning} cloning`);
  return parts.join(' · ');
}
