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

// The 32 lowercase hex characters `createShellMarkerNonce` mints. Defined here, whose only import is a
// type, so the server's zsh startup script, the client-imported shell plugin guard, and both remote
// frame decoders can all check one shape through a module safe for the browser graph.
export function isShellMarkerNonce(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}
