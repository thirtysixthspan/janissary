export type LineNote = { body: string; source: string };
export type CommentState = { notes: ReadonlyMap<string, LineNote>; drafts: ReadonlyMap<string, LineNote> };
export type CommentAction =
  | { type: 'start'; key: string; source: string }
  | { type: 'edit'; key: string; body: string }
  | { type: 'save' | 'cancel' | 'remove'; key: string };

export function commentReducer(state: CommentState, action: CommentAction): CommentState {
  switch (action.type) {
    case 'start': {
      if (state.drafts.has(action.key)) return state;
      const note = state.notes.get(action.key) ?? { body: '', source: action.source };
      return { ...state, drafts: new Map(state.drafts).set(action.key, note) };
    }
    case 'edit': {
      const draft = state.drafts.get(action.key);
      return draft ? { ...state, drafts: new Map(state.drafts).set(action.key, { ...draft, body: action.body }) } : state;
    }
    case 'save': {
      const draft = state.drafts.get(action.key);
      if (!draft?.body.trim()) return state;
      const drafts = new Map(state.drafts);
      drafts.delete(action.key);
      return { notes: new Map(state.notes).set(action.key, { ...draft, body: draft.body.trim() }), drafts };
    }
    case 'cancel': {
      const drafts = new Map(state.drafts);
      drafts.delete(action.key);
      return { ...state, drafts };
    }
    case 'remove': {
      const notes = new Map(state.notes);
      const drafts = new Map(state.drafts);
      notes.delete(action.key);
      drafts.delete(action.key);
      return { notes, drafts };
    }
  }
}
