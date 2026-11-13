export type FileWritePolicy = 'tool-text';

export interface FileWriteRequest {
  kind: 'write';
  path: string;
  content: string;
  expectedHash?: string;
}

export interface FileEditRequest {
  kind: 'edit';
  path: string;
  oldString: string;
  newString: string;
  replaceAll: boolean;
}

export type FileMutationRequest = FileWriteRequest | FileEditRequest;

export interface FileEditValue {
  replacements: number;
}

export const NO_MATCHING_TEXT_REASON = 'No matching text';
export const MULTIPLE_MATCHES_REASON = 'Multiple matches';
