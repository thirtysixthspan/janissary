import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { connectAcp } from './index.js';
import { getProjectTokens } from '../project/tokens.js';
import type * as SandboxModule from '../sandbox/index.js';
import type { SandboxOptions } from '../sandbox/index.js';
import type { AcpInfo, AcpSession } from './types.js';
import { shutdownProcessTree } from './process-tree.js';
import { AcpManager } from './manager.js';
import { NATIVE_ACP_COMMANDS } from '../plugins/roles/shared.js';
import { AcpSessionRecords } from '../acp-records/manager.js';
import { TabManager } from '../tab/manager.js';
import { makeTab } from '../tab/index.js';
import type { Managers } from '../managers.js';
import { RemoteChannel } from '../remote/channel/index.js';
import { RemoteAcp } from '../remote/serve-acp.js';
import { decodeFrame, encodeFrame, encodeHandshake } from '../remote/protocol.js';

// The sandbox is left real — these tests drive actual subprocesses — but every call's options are
// recorded, so what `connectAcp` decides to inject can be asserted without mocking the spawn itself.
const sandboxCalls = vi.hoisted(() => ({
  options: [] as SandboxOptions[], envs: [] as NodeJS.ProcessEnv[], bypassWorkspace: false,
}));
vi.mock('../sandbox/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SandboxModule>();
  return {
    ...actual,
    sandboxSpawn: (options: SandboxOptions, command: string, args: string[], env: NodeJS.ProcessEnv) => {
      sandboxCalls.options.push(options);
      sandboxCalls.envs.push(env);
      return actual.sandboxSpawn({ ...options, workspaceDir: undefined }, command, args, env);
    },
  };
});

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
let configuredEffort = false;
let cancels = 0;

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
  if (message.method === 'session/cancel') {
    if (message.id !== undefined || message.params.sessionId !== sessionId) process.exit(2);
    cancels += 1;
    setTimeout(() => {
      chunk('final activity');
      write({ jsonrpc: '2.0', id: promptId, result: { stopReason: 'cancelled' } });
    }, 60);
    return;
  }
  if (message.id !== undefined && message.method === undefined) {
    chunk('outcome=' + JSON.stringify(message.result.outcome));
    write({ jsonrpc: '2.0', id: promptId, result: { stopReason: 'end_turn' } });
    return;
  }
  if (message.method === 'session/set_config_option') {
    configuredEffort = message.params.value === 'high';
    write({
      jsonrpc: '2.0',
      id: message.id,
      result: { configOptions: [] },
    });
    return;
  }
  if (message.method === 'initialize') {
    if (mode === 'fail-init') {
      write({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'initialization failed' } });
      return;
    }
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
        ...(mode === 'effort' && {
          configOptions: [{
            id: 'reasoning', name: 'Effort', category: 'thought_level', type: 'select', currentValue: 'medium',
            options: [{ value: 'medium', name: 'Medium' }, { value: 'high', name: 'High' }],
          }],
        }),
      },
    });
    return;
  }
  if (message.method !== 'session/prompt') return;
  if (mode === 'exit-held') {
    promptId = message.id;
    chunk('held');
    setTimeout(() => process.exit(1), 10);
    return;
  }
  if (mode === 'cancel' && message.params.prompt[0].text.split('\n').at(-1) === 'hold') {
    promptId = message.id;
    chunk('held');
    return;
  }
  if (mode === 'cancel') chunk('cancels=' + cancels + ' ');
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
  chunk('protocol=' + negotiated + ' sessions=' + sessions + (mode === 'effort' ? ' configured=' + configuredEffort : '') + ' ');
  chunk(mode === 'split' ? 'héllo wörld 🌍' : 'hello');
  write({ jsonrpc: '2.0', id: message.id, result: { stopReason: 'end_turn' } });
  // Walks off after answering, standing in for an agent that crashes mid-session.
  if (mode === 'exit') setTimeout(() => process.exit(0), 10);
  // The same crash, but saying why on the way out — an agent whose session has expired and that
  // wants the user to do something about it. A pipe write is synchronous on POSIX, so the message
  // is in the pipe before the exit. No backticks in here: this whole script is a template literal.
  if (mode === 'stderr') setTimeout(() => {
    process.stderr.write('opencode: session expired\nRun "opencode auth login", then start a new session.\n');
    process.exit(1);
  }, 10);
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

function connect(
  mode: string,
  allowedTools?: string[],
  autonomous?: true,
  effort?: { level: string; model: string },
  onActivity?: (update: unknown) => void,
  installedSkillDirs?: string[],
): Connected {
  const errors: string[] = [];
  const connected = Promise.withResolvers<AcpInfo>();
  const session = connectAcp({
    command: process.execPath,
    args: [agentScript(), mode],
    cwd: os.tmpdir(),
    onError: (message) => { errors.push(message); },
    onConnect: connected.resolve,
    allowedTools,
    autonomous,
    effort,
    installedSkillDirs,
    onActivity,
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
  sandboxCalls.bypassWorkspace = false;
  for (const session of sessions) session.kill();
  sessions = [];
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
  roots = [];
});

describe('connectAcp', () => {
  it('records and cancels a real held provider turn through a version-37 remote channel in a scratch project', async () => {
    sandboxCalls.bypassWorkspace = true;
    const script = agentScript();
    const root = path.dirname(script);
    const records = new AcpSessionRecords({ projectDir: root });
    const managers = { acpRecords: records } as Managers;
    managers.models = { isKnownModel: () => true } as Managers['models'];
    managers.tab = new TabManager(managers, root);
    managers.tab.tabs.push(makeTab('owner', '#fff'), makeTab('other', '#abc'));
    for (const tab of managers.tab.tabs) tab.remote = { address: 'stub-host', host: 'stub-host' };
    const channel = new RemoteChannel({
      id: 'stdio', kill: () => {},
      write: (line) => {
        const frame = decodeFrame(line.trim());
        if (!('type' in frame)) throw new Error(frame.error);
        switch (frame.type) {
        case 'acp-open': { holder.open({ ...frame, command: process.execPath, args: [script, 'cancel'], env: {} }); break; }
        case 'acp-prompt': { holder.prompt(frame); break; }
        case 'acp-cancel': { holder.cancel(frame.id); break; }
        case 'acp-close': { void holder.close(frame.id); break; }
        default: { throw new Error(`Unexpected test frame ${frame.type}`); }
        }
      },
    }, { onAttached: () => {}, onTerminalData: () => {}, onFrame: () => {}, onError: () => {}, onClose: () => {} });
    const holder = new RemoteAcp((frame) => channel.receive(`${encodeFrame(frame)}\n`), root);
    channel.receive(`${encodeHandshake()}\n`);
    managers.remote = { get: () => channel } as Managers['remote'];
    managers.acp = new AcpManager(managers, (_root, role) => ({
      name: role, entries: [{ harness: 'opencode', model: 'google/gemini-3.1-flash-lite' }],
      commands: [...NATIVE_ACP_COMMANDS],
    }));
    try {
      managers.acp.start('owner', { withoutTools: true });
      const pending = managers.acp.prompt('owner', 'hold');
      await vi.waitFor(() => expect(records.rows()[0]?.status).toBe('Running'));
      await vi.waitFor(() => expect(records.window(records.rows()[0].id)?.blocks[0].entries[0]?.text).toBe('held'));
      const id = managers.tab.byLabel('owner')!.runtime!.acpRoles!.ask!.recordId!;
      const identity = managers.acp.sessionIdentity('owner');
      managers.acp.start('other', { withoutTools: true });
      await expect(managers.acp.prompt('other', 'independent')).resolves.toContain('cancels=0');
      const cancellation = managers.acp.cancel('owner');
      await expect(managers.acp.prompt('owner', 'overlap')).resolves.toBe('ACP: a prompt is already running.');
      await cancellation;
      await expect(pending).resolves.toBe('ACP: prompt cancelled.');
      expect(records.window(id)).toMatchObject({ status: 'Idle', blocks: [{ answer: 'ACP: prompt cancelled.', entries: [{ text: 'heldfinal activity' }] }] });
      expect(managers.acp.sessionIdentity('owner')).toBe(identity);
      await expect(managers.acp.prompt('owner', 'next')).resolves.toContain('cancels=1 protocol=1 sessions=1');
      expect(managers.tab.byLabel('owner')!.runtime!.acpRoles!.ask!.recordId).toBe(id);
      expect(records.window(id)?.totalBlocks).toBe(2);
    } finally {
      managers.acp.closeAll();
      await holder.dispose();
      records.dispose();
    }
  });
  it('releases a cancelling turn when initialization fails', async () => {
    const { session } = connect('fail-init');
    const pending = prompt(session, 'hi');
    const failed = expect(pending).rejects.toThrow('initialization failed');
    await session.cancel();
    await failed;
  });

  it('releases drain on an unexpected process exit during a held prompt', async () => {
    const { session } = connect('exit-held');
    const held = Promise.withResolvers<void>();
    const ended = Promise.withResolvers<void>();
    session.prompt('hold', {
      onChunk: held.resolve, onEnd: () => ended.reject(new Error('unexpected end')), onError: () => ended.resolve(),
    });
    await held.promise;
    await session.cancel();
    await ended.promise;
  });

  it('releases cancellation on kill before handshake and publishes no late identity', async () => {
    const { session } = connect('basic');
    const h = { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
    session.prompt('hi', h);
    const pending = session.cancel();
    session.kill();
    await pending;
    expect(h.onError).toHaveBeenCalledExactlyOnceWith('ACP session closed.');
    expect(h.onEnd).not.toHaveBeenCalled();
  });
  it('initializes an autonomous session before its first prompt so remote readiness can complete', async () => {
    const { session, info } = connect('basic', undefined, true);
    expect(await info).toMatchObject({ provider: 'stub-agent' });
    const reply = await prompt(session, 'task');
    expect(reply.text).toBe('protocol=1 sessions=1 hello');
  });
  it('sends native cancellation immediately but retains the old turn until provider drain', async () => {
    const { session } = connect('cancel');
    const held = Promise.withResolvers<void>();
    const ended = Promise.withResolvers<string>();
    const chunks: string[] = [];
    session.prompt('hold', {
      onChunk: (text) => { chunks.push(text); held.resolve(); },
      onEnd: ended.resolve,
      onError: (message) => ended.reject(new Error(message)),
    });
    await held.promise;
    const cancellation = session.cancel();
    const overlap = { onChunk: vi.fn(), onEnd: vi.fn(), onError: vi.fn() };
    session.prompt('steal', overlap);
    expect(overlap.onError).toHaveBeenCalledWith('ACP: a prompt is already running.');
    expect(chunks).toEqual(['held']);
    await cancellation;
    expect(await ended.promise).toBe('cancelled');
    expect(chunks).toEqual(['held', 'final activity']);
    const next = await prompt(session, 'next');
    expect(next.text).toBe('cancels=1 protocol=1 sessions=1 hello');
  });

  it('cancels an unsent pre-handshake turn and reuses its completed initialization', async () => {
    const { session, info } = connect('cancel');
    const pending = prompt(session, 'hold');
    await session.cancel();
    expect(await pending).toEqual({ text: '', stopReason: 'cancelled' });
    expect(await info).toMatchObject({ provider: 'stub-agent' });
    const next = await prompt(session, 'next');
    expect(next.text).toBe('cancels=0 protocol=1 sessions=1 hello');
  });

  it('allows a terminal handler to synchronously start a new provider turn', async () => {
    const { session } = connect('basic');
    const next = Promise.withResolvers<{ text: string; stopReason: string }>();
    session.prompt('first', {
      onChunk: () => {},
      onEnd: () => { void prompt(session, 'next').then(next.resolve, next.reject); },
      onError: next.reject,
    });
    const reply = await next.promise;
    expect(reply.text).toBe('protocol=1 sessions=1 hello');
  });
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

  it('offers typed session updates to an opted-in activity observer', async () => {
    const activity: unknown[] = [];
    const { session } = connect('other-updates', undefined, undefined, undefined, (update) => { activity.push(update); });

    await prompt(session, 'hi');

    expect(activity).toEqual([
      { sessionUpdate: 'agent_message_chunk', content: { type: 'image', data: 'AA==', mimeType: 'image/png' } },
      { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'thinking' } },
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'protocol=1 sessions=1 ' } },
      { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hello' } },
    ]);
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

  it('approves provider permissions only for an explicitly autonomous connection', async () => {
    const { session } = connect('permission', undefined, true);

    const reply = await prompt(session, 'run task tools');

    expect(reply.text).toBe('outcome={"outcome":"selected","optionId":"once"}');
  });

  it('sets the advertised effort configuration before the first prompt', async () => {
    const { session } = connect('effort', undefined, undefined, { level: 'high', model: 'provider/model' });

    const reply = await prompt(session, 'run task tools');

    expect(reply.text).toBe('protocol=1 sessions=1 configured=true hello');
  });
});

// A crashed agent used to leave a session whose next prompt wrote into a closed stdin and never
// returned. The connection-level channel is what tells the caller the session is gone.
describe('connectAcp — the agent process ending', () => {
  it('reports an exit through onError exactly once', async () => {
    const { session, errors } = connect('exit');
    await prompt(session, 'hi');

    for (let i = 0; i < 100 && errors.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 50));

    expect(errors).toEqual(['ACP agent exited.']);
  });

  it('reports nothing when the exit follows a deliberate kill', async () => {
    const { session, errors } = connect('basic');
    await prompt(session, 'hi');

    session.kill();
    await new Promise((r) => setTimeout(r, 150));

    expect(errors).toEqual([]);
  });

  it('awaits the observed child exit and shares concurrent shutdown calls', async () => {
    const { session, errors } = connect('basic');
    await prompt(session, 'hi');

    const shutdown = session.shutdown();

    expect(session.shutdown()).toBe(shutdown);
    await expect(shutdown).resolves.toBeUndefined();
    expect(errors).toEqual([]);
  });

  it('escalates and rejects when owned process-tree shutdown cannot be confirmed', async () => {
    const process = { pid: 42 } as NodeJS.ChildProcess;
    const signals: NodeJS.Signals[] = [];

    await expect(shutdownProcessTree(process, Promise.resolve(), 20, 40, {
      isRunning: () => true,
      signal: (_proc, signal) => { signals.push(signal); },
    })).rejects.toThrow('ACP process tree shutdown timed out.');

    expect(signals).toEqual(['SIGTERM', 'SIGKILL']);
  });

  it('treats ESRCH from the process-group probe as absence', async () => {
    const child = { pid: 42 } as NodeJS.ChildProcess;
    const signals: (NodeJS.Signals | number | undefined)[] = [];
    const kill = vi.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
      signals.push(signal);
      throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
    });

    try {
      await expect(shutdownProcessTree(child, Promise.resolve())).resolves.toBeUndefined();
      expect(signals).toEqual(['SIGTERM', 0]);
    } finally {
      kill.mockRestore();
    }
  });

  // The agent's stdout is the ACP transport, so stderr is the only place it can say why it went.
  // Nobody read it before, which left the tab holding "ACP agent exited." and nothing else — and
  // the useful half is exactly the part that says what to do next.
  it('carries the agent\'s stderr into the exit report', async () => {
    const { session, errors } = connect('stderr');
    await prompt(session, 'hi');

    for (let i = 0; i < 100 && errors.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 50));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('ACP agent exited.');
    expect(errors[0]).toContain('opencode: session expired');
    expect(errors[0]).toContain('Run "opencode auth login", then start a new session.');
  });
});

// A server started without the user's interactive rc file (a launcher, a `--no-rcs` tab shell) has
// a PATH that lacks what a version manager adds there, so `opencode` installed under nvm was not
// found and the agent failed with `spawn opencode ENOENT`. The user's shell is a stand-in here that
// only knows the agent's directory once it is asked to run something.
describe('connectAcp — an agent only the user\'s shell can find', () => {
  const originalShell = process.env.SHELL;

  afterEach(() => {
    if (originalShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = originalShell;
  });

  function installAgentOutsidePath(): { binDir: string; shell: string } {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'janissary-acp-shell-'));
    roots.push(directory);
    const binDir = path.join(directory, 'bin');
    mkdirSync(binDir);
    writeFileSync(path.join(binDir, 'stub-acp-agent'), `#!${process.execPath}\n${STUB_AGENT}`, { mode: 0o755 });
    const shell = path.join(directory, 'user-shell');
    writeFileSync(shell, `#!/bin/sh\nPATH="${binDir}:$PATH"; export PATH\nfor last; do :; done\nexec /bin/sh -c "$last"\n`, { mode: 0o755 });
    return { binDir, shell };
  }

  it('starts a bare agent command found on the user\'s interactive shell PATH', async () => {
    const { shell } = installAgentOutsidePath();
    process.env.SHELL = shell;
    const errors: string[] = [];
    const session = connectAcp({
      command: 'stub-acp-agent',
      args: ['basic'],
      cwd: os.tmpdir(),
      env: { PATH: '/usr/bin:/bin' },
      onError: (message) => { errors.push(message); },
    });
    sessions.push(session);

    const reply = await prompt(session, 'hi');

    expect(reply.text).toBe('protocol=1 sessions=1 hello');
    expect(errors).toEqual([]);
  });
});

// The credentials a workspaced session injects. A remote session's are the forwarded-over-own map
// its server computed, which would be lost if `connectAcp` always read this machine's own file.
describe('connectAcp — credentials', () => {
  function connectWorkspaced(tokens?: Record<string, string>): void {
    const session = connectAcp({
      command: process.execPath,
      args: [agentScript(), 'basic'],
      cwd: os.tmpdir(),
      workspaceDir: path.join(os.tmpdir(), 'janissary-acp-workspace'),
      onError: () => {},
      ...(tokens && { tokens }),
    });
    sessions.push(session);
  }

  it('passes an explicit token map straight through to the sandbox options', () => {
    sandboxCalls.options.length = 0;

    connectWorkspaced({ github: 'forwarded-token' });

    expect(sandboxCalls.options.at(-1)?.tokens).toEqual({ github: 'forwarded-token' });
  });

  it('falls back to this project\'s own tokens when none are given', () => {
    sandboxCalls.options.length = 0;

    connectWorkspaced();

    expect(sandboxCalls.options.at(-1)?.tokens).toEqual(getProjectTokens());
  });

  function connectUnworkspaced(tokens: Record<string, string>, env?: Record<string, string>): void {
    const session = connectAcp({
      command: process.execPath,
      args: [agentScript(), 'basic'],
      cwd: os.tmpdir(),
      onError: () => {},
      tokens,
      ...(env && { env }),
    });
    sessions.push(session);
  }

  it('hands an agent outside a workspace the harness credentials, not the GitHub token', () => {
    sandboxCalls.options.length = 0;
    sandboxCalls.envs.length = 0;

    connectUnworkspaced({ github: 'gh-file', claude: 'c', opencode: 'o', kilo: 'k', gemini: 'g' });

    expect(sandboxCalls.envs.at(-1)).toMatchObject({
      CLAUDE_CODE_OAUTH_TOKEN: 'c',
      OPENCODE_API_KEY: 'o',
      KILO_API_KEY: 'k',
      GEMINI_API_KEY: 'g',
      GOOGLE_GENERATIVE_AI_API_KEY: 'g',
    });
    expect(sandboxCalls.envs.at(-1)?.GH_TOKEN).not.toBe('gh-file');
    expect(sandboxCalls.options.at(-1)?.tokens).toBeUndefined();
    expect(sandboxCalls.options.at(-1)?.workspaceDir).toBe(os.tmpdir());
    expect(sandboxCalls.options.at(-1)?.tmpDir).toContain(path.join(os.tmpdir(), '.janissary', 'acp-'));
  });

  it('lets the launch\'s own environment override a credential variable', () => {
    sandboxCalls.envs.length = 0;

    connectUnworkspaced({ opencode: 'from-file' }, { OPENCODE_API_KEY: 'from-launch', OPENCODE_CONFIG_CONTENT: '{}' });

    expect(sandboxCalls.envs.at(-1)).toMatchObject({ OPENCODE_API_KEY: 'from-launch', OPENCODE_CONFIG_CONTENT: '{}' });
  });

  it('leaves a workspaced session\'s credentials to the sandbox', () => {
    sandboxCalls.options.length = 0;
    sandboxCalls.envs.length = 0;

    connectWorkspaced({ opencode: 'workspace-key' });

    expect(sandboxCalls.options.at(-1)?.tokens).toEqual({ opencode: 'workspace-key' });
    expect(sandboxCalls.envs.at(-1)?.OPENCODE_API_KEY).not.toBe('workspace-key');
  });

  it('forwards selected installed skill directories to sandboxSpawn', () => {
    sandboxCalls.options.length = 0;
    const installedSkillDirs = [path.join(os.tmpdir(), 'janissary', 'skills', 'ask-user')];

    connect('basic', undefined, true, undefined, undefined, installedSkillDirs);

    expect(sandboxCalls.options.at(-1)?.installedSkillDirs).toEqual(installedSkillDirs);
  });
});
