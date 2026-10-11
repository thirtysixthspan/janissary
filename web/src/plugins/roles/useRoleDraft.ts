import { useCallback, useState } from 'react';

export type RoleDraftCommit = { text: string; baseline: string };

export type RoleDraft = {
  value: string;
  set(next: string): void;
  revert(): void;
  commit(): RoleDraftCommit | null;
  conflicted: boolean;
};

// One editable field of a role card: the text it shows, the stored value that text was written
// against, and whether the user has typed since. A republished stored value the user has not touched
// is followed, so an untouched field never commits text the file does not hold. One that arrives
// under an active draft sets `conflicted` and replaces the draft, because a draft written against a
// baseline the server no longer agrees with cannot be saved. Both halves are required for that: the
// republished value this client just wrote is its own draft coming back, not text that displaced
// anybody, and reporting it would put a conflict line under every description save.
export function useRoleDraft(authoritative: string): RoleDraft {
  const [draft, setDraft] = useState(authoritative);
  const [baseline, setBaseline] = useState(authoritative);
  const [conflicted, setConflicted] = useState(false);

  if (baseline !== authoritative) {
    setConflicted(draft !== baseline && draft !== authoritative);
    setDraft(authoritative);
    setBaseline(authoritative);
  }

  const set = useCallback((next: string) => {
    setConflicted(false);
    setDraft(next);
  }, []);

  const revert = useCallback(() => {
    setConflicted(false);
    setDraft(baseline);
  }, [baseline]);

  const commit = useCallback(
    () => (draft === baseline ? null : { text: draft, baseline }),
    [baseline, draft],
  );

  return { value: draft, set, revert, commit, conflicted };
}