// Conversations-domain wire types, composed into the shared contract by ../protocol.ts.
//
// One conversation is a durable record under the user's data directory; a turn is one query and the
// reply that answered it, carrying the pair that answered it so a history stays honest about which
// model produced which turn.

export type ConversationHarness = 'claude' | 'opencode';

export type ConversationModelPair = {
  harness: ConversationHarness;
  model: string;
};

export type ConversationSummaryView = {
  id: string;
  title: string;
  updatedAt: number;
};

export type ConversationTurnView = {
  query: string;
  response: string;
  pair: ConversationModelPair;
  error?: string;
  streaming?: boolean;
};

export type ConversationWindowView = {
  id: string;
  title: string;
  pair: ConversationModelPair;
  turns: ConversationTurnView[];
  hasOlder: boolean;
  deleted?: boolean;
};

export type ConversationsView = {
  summaries: ConversationSummaryView[];
  windows: ConversationWindowView[];
  models: ConversationModelPair[];
};
