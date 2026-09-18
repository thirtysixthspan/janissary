// Remote-sessions-domain wire types and RPCs, composed into the shared contract by ../protocol.ts.
//
// One row of the sessions tab. A row is one tab — a remote harness tab, a remote agent tab, a plain
// ssh tab, a remote file navigator — or one process still alive on a peer this janissary is no
// longer attached to. There is deliberately no row standing for a channel: a shared channel shows
// itself by grouping, which is what `joined` carries.

export type RemoteSessionKind = 'harness' | 'agent' | 'ssh' | 'navigator';

// `provisioning` is a remote tab whose workspace clone has not landed yet, `reconnecting` a live
// entry whose transport is gone and whose backoff is already running, `detached` a peer parked on
// its host, and `ended` a session a reattach or an end established is over.
export type RemoteSessionState =
  | 'provisioning' | 'active' | 'reconnecting' | 'detached' | 'ended';

// What a row offers. Kept as a list on the row rather than derived by the client from kind and
// state, so the server stays the single source of truth about what may be pressed (principle 1).
export type RemoteSessionAction =
  | 'reattach' | 'detach' | 'end' | 'forget' | 'focus' | 'close';

export type RemoteSessionView = {
  // Stable row identity: the tab label for a live row, `<session>:<spawn id>` for a recorded one.
  // The client keys its selection on this and sends nothing else back.
  id: string;
  // The bare host, first column.
  host: string;
  // What the row is running, second column: a harness or agent label, `ssh`, or a navigator's
  // abbreviated root.
  name: string;
  kind: RemoteSessionKind;
  state: RemoteSessionState;
  // Epoch milliseconds of last activity. The client renders the relative form, so a row's age keeps
  // ticking without the server re-broadcasting the list.
  activity: number;
  // The row's tooltip: the full destination as launched, and the remote workspace path.
  destination: string;
  workspace: string;
  // A row riding another row's channel, rendered indented under it. Detach, end, and forget live on
  // the launching row only, because they act on a whole channel.
  joined: boolean;
  actions: RemoteSessionAction[];
  // The tab this row is, or — for a recorded row — the tab label a reattach would take back.
  label: string;
  // The far side's session id, present exactly when the row belongs to a recorded session.
  session?: string;
  // What the last reattach or end reported, when one failed. It is also what earns the row its trash
  // button: forgetting a session must not be the easy way past a host that is merely slow.
  failure?: string;
  // An end attempt on this session is in flight. Set only on a detached row, and what keeps its
  // destructive controls from being pressed a second time while the first is still reaching the host.
  ending?: boolean;
};

export type RemoteSessionRpcCall =
  // The metadata row's control, both verbs behind one method: a per-verb method would be two
  // dispatcher arms and two decoders for one decision the row already made.
  { method: 'remoteSession'; params: { action: 'detach' | 'reattach'; label: string } };
