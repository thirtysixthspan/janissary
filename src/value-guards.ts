import type { ConversationModelPair } from './protocol.js';

// The two guards that open almost every decode in this codebase, named once so a decoder does not
// carry its own copy: `isRecord` for "this is a JSON object rather than a scalar or an array", and
// `isModelPair` for the harness/model pair a conversation and its plugin tab both carry.
//
// `isModelPair` narrows to the protocol's `ConversationModelPair`. A plugin contract that declares
// the same shape locally — it cannot import `protocol.js` across the plugin boundary — is satisfied
// by it structurally, which is why one guard serves both sides of that boundary.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isModelPair(value: unknown): value is ConversationModelPair {
  return isRecord(value)
    && (value.harness === 'claude' || value.harness === 'opencode')
    && typeof value.model === 'string';
}
