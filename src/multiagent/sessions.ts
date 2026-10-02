import { connectAcp } from '../acp/index.js';
import { acpLaunchFor } from '../acp/launch.js';
import type { AcpSession } from '../acp/types.js';
import { messageBus } from '../bus.js';
import type { MultiAgentMember } from './types.js';

// The composite key, copied from `EditorAcpManager`: a tab label alone cannot hold N sessions, so a
// member's key carries the member's own index inside it. `closeTab` prefix-scans on the label.
const key = (label: string, index: number): string => `${label}:${index}`;

// The member connection registry: one live ACP session per member of a multi-agent tab, keyed by
// label and member index. `AcpManager` keys its sessions by tab label and holds exactly one per tab,
// so it cannot host eight and stays as it is; these live here.
//
// Each session is spawned with that member's *own* `cwd` and `workspaceDir` rather than read off the
// tab, which is the one place today's wiring has to differ: `AcpManager.session` takes `cwd` as a
// parameter but reads `workspaceDir` and `offline` off the tab, which is right for one session per
// tab and wrong for eight in one — a session pointed at a clone it is not confined to would look
// workspaced and not be. Exactly as `ConversationSessions` already threads a per-session workspace.
export class MultiAgentSessions {
  private sessions = new Map<string, AcpSession>();

  // Open a member's connection, prompt it, and settle its row. `answer` accumulates chunks locally
  // rather than writing them onto the member: `emitState` broadcasts the whole view on essentially
  // every mutation, an ACP chunk is one mutation, and eight streaming members would each multiply
  // that. The member is written once, when the turn ends — and written *loudly*, because a payload
  // nobody is told about is a payload no client receives: a state change goes out with each
  // terminal transition, the way `EditorAcpManager` emits after mutating the same kind of state.
  connect(
    label: string,
    member: MultiAgentMember,
    prompt: string,
    offline: boolean,
  ): void {
    const k = key(label, member.index);
    const session = connectAcp({
      ...acpLaunchFor({ harness: 'opencode', model: member.model, variant: 'default' }),
      cwd: member.dir ?? process.cwd(),
      workspaceDir: member.dir,
      offline,
      // The opt-in that lets a member's agent use its own tools, which an ordinary agent tab's may
      // not. It is safe here because this process is confined to this member's own clone.
      ownTools: true,
      onError: (message) => this.died(k, session, member, message),
    });
    this.sessions.set(k, session);
    member.state = 'running';
    let answer = '';
    session.prompt(prompt, {
      onChunk: (text) => { answer += text; },
      onEnd: () => {
        member.answer = answer;
        member.state = 'answered';
        messageBus.emit('state', { type: 'dirty' });
      },
      onError: (message) => {
        member.state = 'failed';
        member.error = message;
        messageBus.emit('state', { type: 'dirty' });
      },
    });
  }

  // A connection-level error means the agent is gone (it failed to start or exited), so the member
  // is marked failed and its session forgotten — the discipline `EditorAcpManager` uses. Nothing at
  // all when this session is no longer the one registered under `k`: a late report from a closed or
  // replaced session must not drop its successor, and must not announce anything either.
  private died(k: string, session: AcpSession, member: MultiAgentMember, message: string): void {
    if (this.sessions.get(k) !== session) return;
    this.sessions.delete(k);
    member.state = 'failed';
    member.error = message;
    messageBus.emit('state', { type: 'dirty' });
  }

  closeTab(label: string): void {
    for (const [k, session] of this.sessions) {
      if (!k.startsWith(`${label}:`)) continue;
      session.kill();
      this.sessions.delete(k);
    }
  }

  dispose(): void {
    for (const session of this.sessions.values()) session.kill();
    this.sessions.clear();
  }
}
