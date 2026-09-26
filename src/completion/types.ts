export type CompletionResult = {
  newInput: string;
  newCursor: number;
  matches: string[];
};

export type CompletionCursor = {
  before: string;
  after: string;
  tokenStart: number;
  token: string;
  preceding: string[];
  command: string;
  argumentIndex: number;
};
