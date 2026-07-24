export type PromptHandlers = {
  onChunk: (text: string) => void;
  onEnd: (stopReason: string) => void;
  onError: (message: string) => void;
};

export type AcpSession = {
  // Send a prompt and stream the agent's text reply through `handlers`.
  prompt: (text: string, handlers: PromptHandlers) => void;
  kill: () => void;
};

export type AcpInfo = { provider?: string; model?: string };

export type AcpOptions = {
  command: string;
  args: string[];
  cwd: string;
  // Connection-level errors (failed spawn, protocol errors outside a prompt).
  onError: (message: string) => void;
  // Called once the session handshake completes, with the agent's reported identity.
  onConnect?: (info: AcpInfo) => void;
  // Extra environment variables to pass to the subprocess.
  env?: Record<string, string>;
  // When the session belongs to a workspaced tab, confines the ACP subprocess to that workspace
  // via a Seatbelt sandbox (see sandbox.ts). Monitor sessions never set this.
  workspaceDir?: string;
  offline?: boolean;
  // Tool ids the connection's permission handler may approve (see acp-tools.ts). Undefined/empty
  // (every non-monitor caller and every tool-less persona) means deny every tool request.
  allowedTools?: string[];
};

export type AcpPromptHandlers = {
  onChunk: (text: string) => void;
  onEnd: (stopReason: string) => void;
  onError: (message: string) => void;
};

// Structural subset of `AcpSession` the loop needs.
export type AcpLoopSession = {
  prompt: (text: string, handlers: AcpPromptHandlers) => void;
};

export type AcpLoopDeps = {
  // Prepended to the first prompt (e.g. the db primer) when starting a new session.
  primer?: string;
  // Execute an extracted command and return its textual output. May be async (e.g. a
  // browser command); the loop awaits the result before continuing.
  runCommand: (command: string) => string | Promise<string>;
  // Pull a runnable command out of an agent reply, or null when there is none.
  extractCommand: (text: string) => string | null;
  // Maximum number of auto-run command steps before stopping (default 8).
  maxSteps?: number;
};

export type AcpLoopHandlers = {
  // A new agent turn is starting; `isFirst` is true only for the opening turn.
  startTurn: (isFirst: boolean) => void;
  // Cumulative streamed text for the current turn.
  chunk: (cumulative: string) => void;
  // The current turn finished with this final text.
  endTurn: (final: string) => void;
  // A command was auto-run; show it and its result.
  ranCommand: (command: string, result: string) => void;
  // The loop ended: `answered` (no command emitted) or `capped` (hit `maxSteps`).
  finished: (reason: 'answered' | 'capped', maxSteps: number) => void;
  // A connection/prompt error occurred.
  error: (message: string) => void;
};
