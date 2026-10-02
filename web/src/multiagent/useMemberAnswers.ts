import { useMemo, useRef } from 'react';
import type { MultiAgentMemberView } from '@shared/protocol';
import { renderMarkdown } from '../shared/transcript/markdown';

type Rendered = { answer: string; html: string };

// Each answered member's sanitized HTML, keyed by member index, and `undefined` for a member that
// has not answered.
//
// The answers go through the same pipeline the transcript uses, so a member's answer looks like the
// rest of the app's markdown and needs no renderer of its own — but `marked` parsing is not free and
// the mounted layers re-render on every state broadcast, so each answer is parsed once, when it
// first lands, and the rendered HTML is kept against the exact text it came from. A member whose
// answer never changes is never re-parsed, however many broadcasts follow it.
export function useMemberAnswers(members: MultiAgentMemberView[]): Map<number, string | undefined> {
  const parsed = useRef(new Map<number, Rendered>());
  return useMemo(() => {
    const answers = new Map<number, string | undefined>();
    for (const member of members) {
      const { answer } = member;
      if (answer === undefined) { answers.set(member.index, undefined); continue; }
      const cached = parsed.current.get(member.index);
      if (cached?.answer !== answer) {
        parsed.current.set(member.index, { answer, html: renderMarkdown(answer) ?? answer });
      }
      answers.set(member.index, parsed.current.get(member.index)!.html);
    }
    return answers;
  }, [members]);
}
