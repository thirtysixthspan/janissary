// The effort levels the New harness dialog offers and a role entry stores: the fixed vocabulary
// `--effort`/`model_reasoning_effort` is translated to for each harness, plus nothing at all. The
// default (no effort stored) is the absence of a value rather than a member of this list, so it is
// not one. Pure data with no imports, shared by the server capability that publishes it and the
// client surfaces that offer it.
export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export type EffortLevel = (typeof EFFORT_LEVELS)[number];
