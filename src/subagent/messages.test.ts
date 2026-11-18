import { describe, expect, it } from 'vitest';
import type { AgentOutcome } from '../agent/run.js';
import {
  serializeSubagentMessage,
  subagentCompletionText,
  subagentStartedText,
  type SubagentCompletionMessage,
  type SubagentMessage,
  type SubagentStartedMessage,
} from './messages.js';

const INTERNAL_TOKEN = 'acp-session-42';
const PROVIDER_SESSION = 'session-abc123';
const PROVIDER_CALLER = 'caller-def456';

function started(role = 'research'): SubagentStartedMessage {
  return { status: 'started', role, sessionId: PROVIDER_SESSION, callerId: PROVIDER_CALLER };
}

function completion(status: AgentOutcome, output = 'result', sessionId: string | null = PROVIDER_SESSION): SubagentCompletionMessage {
  return { status, sessionId, callerId: PROVIDER_CALLER, output };
}

describe('serializeSubagentMessage', () => {
  it('serializes a started message with exactly the declared fields in order', () => {
    expect(serializeSubagentMessage(started()))
      .toBe('{"status":"started","role":"research","sessionId":"session-abc123","callerId":"caller-def456"}');
  });

  it.each(['completed', 'partial', 'failed', 'terminated'] as const)(
    'serializes a %s completion with exactly the declared fields in order',
    (status) => {
      expect(serializeSubagentMessage(completion(status)))
        .toBe(`{"status":"${status}","sessionId":"session-abc123","callerId":"caller-def456","output":"result"}`);
    },
  );

  it('keeps provider ids verbatim and never substitutes an internal session token', () => {
    const json = serializeSubagentMessage(started('Code Review'));
    expect(json).toContain(`"sessionId":"${PROVIDER_SESSION}"`);
    expect(json).toContain(`"callerId":"${PROVIDER_CALLER}"`);
    expect(json).not.toContain(INTERNAL_TOKEN);
  });

  it('omits a role on completions and an output on started messages', () => {
    const done = JSON.parse(serializeSubagentMessage(completion('completed'))) as Record<string, unknown>;
    expect(Object.keys(done)).toEqual(['status', 'sessionId', 'callerId', 'output']);
    expect(done).not.toHaveProperty('role');

    const begin = JSON.parse(serializeSubagentMessage(started())) as Record<string, unknown>;
    expect(Object.keys(begin)).toEqual(['status', 'role', 'sessionId', 'callerId']);
    expect(begin).not.toHaveProperty('output');
  });

  it('serializes a failed completion with a null session id', () => {
    expect(serializeSubagentMessage(completion('failed', 'Agent: unknown task "x.md".', null)))
      .toBe(String.raw`{"status":"failed","sessionId":null,"callerId":"caller-def456","output":"Agent: unknown task \"x.md\"."}`);
  });

  it('round trips newlines, quotes and backslashes on one physical line', () => {
    const output = 'line one\n  indented "quoted" \\ path\nlast';
    const json = serializeSubagentMessage(completion('completed', output));

    expect(json.split('\n')).toHaveLength(1);
    expect(json).toContain(String.raw`\n`);
    expect(json).toContain(String.raw`\"`);
    expect(json).toContain(String.raw`\\`);
    expect((JSON.parse(json) as SubagentCompletionMessage).output).toBe(output);
  });

  it('never lets structurally wider envelope or internal fields enter the JSON', () => {
    const wider = {
      ...completion('completed'),
      runId: 'run-1',
      callerIncarnation: 'incarnation-1',
      callerRole: 'ask',
      callerSessionIdentity: INTERNAL_TOKEN,
      subagentRole: 'research',
      internalToken: INTERNAL_TOKEN,
    };
    const json = serializeSubagentMessage(wider as SubagentMessage);

    expect(json).toBe(serializeSubagentMessage(completion('completed')));
    for (const field of ['runId', 'callerIncarnation', 'callerRole', 'callerSessionIdentity', 'subagentRole', 'internalToken', INTERNAL_TOKEN]) {
      expect(json).not.toContain(field);
    }
  });
});

describe('subagentStartedText', () => {
  it('uses the canonical role spelling exactly', () => {
    expect(subagentStartedText('research')).toBe('Subagent research started.');
    expect(subagentStartedText('Code Review')).toBe('Subagent Code Review started.');
  });

  it('needs no caller or session id', () => {
    const text = subagentStartedText('research');
    expect(text).not.toContain(PROVIDER_SESSION);
    expect(text).not.toContain(PROVIDER_CALLER);
  });
});

describe('subagentCompletionText', () => {
  it.each(['completed', 'partial', 'failed', 'terminated'] as const)(
    'formats an exact %s completion line',
    (status) => {
      expect(subagentCompletionText('research', status, 'Final answer'))
        .toBe(`Subagent research ${status}.\n\nFinal answer`);
    },
  );

  it('preserves canonical casing, Markdown and whitespace verbatim', () => {
    const output = '# Heading\n\n- item  \n\n```ts\nconst x = 1;\n```\n';
    expect(subagentCompletionText('Code Review', 'completed', output))
      .toBe(`Subagent Code Review completed.\n\n${output}`);
  });

  it('keeps the two-newline boundary with an empty output and adds no suffix', () => {
    expect(subagentCompletionText('research', 'completed', '')).toBe('Subagent research completed.\n\n');
    expect(subagentCompletionText('research', 'partial', '')).toBe('Subagent research partial.\n\n');
    expect(subagentCompletionText('research', 'partial', 'Last reply')).not.toContain('stopped after');
  });

  it('needs no caller or session id', () => {
    const text = subagentCompletionText('research', 'failed', 'error');
    expect(text).not.toContain(PROVIDER_SESSION);
    expect(text).not.toContain(PROVIDER_CALLER);
  });
});
