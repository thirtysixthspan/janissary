import type { EditorRpcCall } from '../protocol/editor.js';
import { isRecord, isString, noParams, type ParamsDecoder } from './guards.js';

// Kept as an exported predicate rather than an inline decoder because `src/message-handler.ts`
// re-checks it inside its own dispatch arm; `client-message.ts` re-exports it from here so that
// import keeps resolving to one definition.
export function isEditorPluginFailedParams(
  value: unknown,
): value is { url: string; plugin: string; reason: string } {
  return isRecord(value)
    && isString(value.url)
    && isString(value.plugin)
    && isString(value.reason);
}

// Keyed by the union so a method added to `EditorRpcCall` without a decoder fails the build.
export const EDITOR_PARAMS: Record<EditorRpcCall['method'], ParamsDecoder> = {
  saveFile: (p) => isString(p.url) && isString(p.content),
  editorSync: (p) => isString(p.url) && isString(p.content),
  resyncEditorTab: (p) => isString(p.url),
  editorPersonas: noParams,
  editorSuggest: (p) => isString(p.url) && isString(p.persona) && isString(p.content) && isString(p.prompt),
  closeEditorConnection: (p) => isString(p.url) && isString(p.persona),
  editorPluginFailed: isEditorPluginFailedParams,
};
