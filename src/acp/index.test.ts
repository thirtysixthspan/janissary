import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { connectAcp } from './index.js';
import type { AcpInfo, AcpSession } from './types.js';

// A dependency-free ACP agent that speaks the wire protocol by hand, spawned as a real subprocess.
// These tests drive the SDK's stdio transport end to end (rather than mocking `connectAcp`), so a
// change in how the SDK frames, parses, or validates messages surfaces here.
const STUB_AGENT = String.raw`
const mode = process.argv[2];
const sessionId = 'stub-session';
let buffer = '';
let sessions = 0;
let negotiated = null;
let promptId = null;

function write(message) {
  const line = JSON.stringify(message) + '\n';
  if (mode !== 'split') {
    process.stdout.write(line);
    return;
  }
  // Emit the line in small byte slices so lines straddle chunk boundaries and multi-byte
  // characters are split across writes.
  const bytes = Buffer.from(line, 'utf8');
  for (let index = 0; index < bytes.length; index += 5) {
    process.stdout.write(bytes.subarray(index, index + 5));
  }
}

function update(payload) {
  write({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: payload } });
}

function chunk(text) {
  update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
}

function handle(message) {
  if (message.id !== undefined && message.method === undefined) {
    chunk('outcome=' + JSON.stringify(message.result.outcome));
    write({ jsonrpc: '2.0', id: promptId, result: { stopReason: 'end_turn' } });
    return;
  }
  if (message.method === 'initialize') {
    negotiated = message.params.protocolVersion;
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: { protocolVersion: 1, agentInfo: { name: 'stub-agent', version: '0.0.1' } },
    });
    return;
  }
  if (message.method === 'session/new') {
    sessions += 1;
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        sessionId,
        modes: { currentModeId: 'fast', availableModes: [{ id: 'fast', name: 'Fast mode' }] },
      },
    });
    return;
  }
  if (message.method !== 'session/prompt') return;
  if (mode === 'permission') {
    promptId = message.id;
    write({
      jsonrpc: '2.0',
      id: 9001,
      method: 'session/request_permission',
      params: {
        sessionId,
        toolCall: { toolCallId: 'tool-1', title: 'WebFetch', kind: 'fetch' },
        options: [{ optionId: 'once', name: 'Allow once', kind: 'allow_once' }],
      },
    });
    return;
  }
  if (mode === 'other-updates') {
    update({ sessionUpdate: 'agent_message_chunk', content: { type: 'image', data: 'AA==', mimeType: 'image/png' } });
    update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'thinking' } });
    update({ sessionUpdate: 'future_variant_from_a_newer_schema', payload: { anything: true } });
  }
  chunk('protocol=' + negotiated + ' sessions=' + sessions + ' ');
  chunk(mode === 'split' ? 'héllo wörld 🌍' : 'hello');
  write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } });
}

process.stdin.on('data', (data) => {
  buffer += data.toString('utf8');
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (line.trim()) handle(JSON.parse(line));
  }
});
`;

let roots: string[] = [];
let sessions: AcpSession[] = [];

function agentScript(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'janissary-acp-agent-'));
  roots.push(directory);
  const file = path.join(directory, 'agent.mjs');
  writeFileSync(file, STUB_AGENT);
  return file;
}

type Connected = { session: AcpSession; info: Promise<AcpInfo>; errors: string[] };

function connect(mode: string, allowedTools?: string[]): Connected {
  const errors: string[] = [];
  const connected = Promise.withResolvers<AcpInfo>();
  const session = connectAcp({
    command: process.execPath,
    args: [agentScript(), mode],
    cwd: os.tmpdir(),
    onError: (message) => { errors.push(message); },
    onConnect: connected.resolve,
    allowedTools,
  });
  sessions.push(session);
  return { session, info: connected.promise, errors };
}

function prompt(session: AcpSession, text: string): Promise<{ text: string; stopReason: string }> {
  return new Promise((resolve, reject) => {
    let streamed = '';
    session.prompt(text, {
      onChunk: (piece) => { streamed += piece; },
      onEnd: (stopReason) => resolve({ text: streamed, stopReason }),
      onError: (message) => reject(new Error(message)),
    });
  });
}

afterEach(() => {
  for (const session of sessions) session.kill();
  sessions = [];
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
  roots = [];
});

describe('connectAcp', () => {
  it('negotiates the protocol version the SDK exports and streams the reply', async () => {
    const { session, info, errors } = connect('basic');

    const reply = await prompt(session, 'hi');

    expect(reply.text).toBe('protocol=1 sessions=1 hello');
    expect(reply.stopReason).toBe('end_turn');
    expect(await info).toEqual({ provider: 'stub-agent', model: 'Fast mode' });
    expect(errors).toEqual([]);
  });

  it('reassembles a reply split across chunk boundaries and multi-byte characters', async () => {
    const { session } = connect('split');

    const reply = await prompt(session, 'hi');

    expect(reply.text).toBe('protocol=1 sessions=1 héllo wörld 🌍');
  });

  it('streams only text message chunks, ignoring other and unknown update kinds', async () => {
    const { session, errors } = connect('other-updates');

    const reply = await prompt(session, 'hi');

    expect(reply.text).toBe('protocol=1 sessions=1 hello');
    expect(errors).toEqual([]);
  });

  it('reuses one session across prompts', async () => {
    const { session } = connect('basic');

    await prompt(session, 'first');
    const second = await prompt(session, 'second');

    expect(second.text).toBe('protocol=1 sessions=1 hello');
  });

  it('denies a tool permission request when no tools are allowed', async () => {
    const { session } = connect('permission');

    const reply = await prompt(session, 'fetch something');

    expect(reply.text).toBe('outcome={"outcome":"cancelled"}');
  });

  it('selects the allowed option for a permitted web tool', async () => {
    const { session } = connect('permission', ['web_fetch']);

    const reply = await prompt(session, 'fetch something');

    expect(reply.text).toBe('outcome={"outcome":"selected","optionId":"once"}');
  });
});
