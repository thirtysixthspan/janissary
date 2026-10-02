// One member of a multi-agent tab: a single opencode model running in a single disposable clone.
// `cloning` while its clone is in flight, `running` once the prompt is delivered, then `answered`
// with the final text or `failed` with the reason. There is no `waiting` — a member is asked the
// instant its clone is ready — and no `closed`: a member whose session dies is `failed` with the
// reason, because a connection that has gone cannot be revived within the run.
export type MultiAgentMemberState = 'cloning' | 'running' | 'answered' | 'failed';

export type MultiAgentMember = {
  // Position in the run's member list, as typed.
  index: number;
  model: string;
  // Server-only: the member's clone directory, and the sandbox boundary its process is confined to.
  // Never projected onto the wire — a path the client has no business holding (see `buildTabView`).
  dir?: string;
  state: MultiAgentMemberState;
  error?: string;
  answer?: string;
};

// The multi-agent tab's payload, present only when `view === 'multiagent'`: the one prompt every
// member received and the members in the order they were listed. Their states are the record — how
// many clones are still in flight is counted from them at projection time rather than stored beside
// them, which is the only way that number cannot disagree with the states it summarizes.
//
// Its members carry their clone directory, so this is the server-side shape — `buildTabView`
// projects it onto `MultiAgentView` for the wire, which is why the two are named apart.
export type MultiAgentRun = {
  prompt: string;
  members: MultiAgentMember[];
};
