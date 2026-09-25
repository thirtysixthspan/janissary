// The rejections a browser supplier may hand the confined client in its own words. Every other
// rejection reaches the client as the guard's fixed start-failure phrase, because the errors behind a
// failed start carry filesystem paths and spawn text the client is denied (see `e2e-guard.ts`).
//
// So the pass-through is an allowlist, and the list is this union: a reason is one of these phrases or
// it does not typecheck. Letting a new phrase through is an edit here, never a string built elsewhere.

// Once a tab's restart budget is spent. The client is told this and the human is told the same.
export const WILL_NOT_RESTART = 'e2e browser will not be restarted';

export type ClientRefusalReason = typeof WILL_NOT_RESTART;

export class E2EClientRefusal extends Error {
  constructor(reason: ClientRefusalReason) {
    super(reason);
    this.name = 'E2EClientRefusal';
  }
}
