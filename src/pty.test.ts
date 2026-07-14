import { describe, it, expect, vi, beforeEach } from 'vitest';

function mockPtyProc() {
  const dataListeners = new Set<(data: string) => void>();
  const exitListeners = new Set<(result: { exitCode: number; signal?: number }) => void>();
  return {
    pid: 12_345,
    cols: 80,
    rows: 24,
    process: 'bash',
    handleFlowControl: false,
    onData: vi.fn((listener: (data: string) => void) => {
      dataListeners.add(listener);
      return { dispose: () => dataListeners.delete(listener) };
    }),
    onExit: vi.fn((listener: (result: { exitCode: number; signal?: number }) => void) => {
      exitListeners.add(listener);
      return { dispose: () => exitListeners.delete(listener) };
    }),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    emitData(data: string) {
      for (const l of dataListeners) l(data);
    },
    emitExit(exitCode: number, signal?: number) {
      for (const l of exitListeners) l({ exitCode, signal });
    },
    dispose() {},
  };
}

const mockPtySpawn = vi.hoisted(() => vi.fn(() => mockPtyProc()));
vi.mock('node-pty', () => ({ spawn: mockPtySpawn }));
vi.mock('./sandbox/index.js', () => ({
  sandboxSpawn: vi.fn((_options, command, args, env) => ({ command, args, env })),
}));

import { spawnPty } from './pty.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('spawnPty', () => {
  it('spawns a pty via sandboxSpawn and node-pty', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    const session = spawnPty('bash', 'echo hi', '/tmp', handlers);

    expect(session).toMatchObject({
      id: expect.stringMatching(/^pty\d+$/),
      program: 'bash',
    });
    expect(typeof session.write).toBe('function');
    expect(typeof session.resize).toBe('function');
    expect(typeof session.kill).toBe('function');
    expect(mockPtySpawn).toHaveBeenCalledOnce();
  });

  it('defaults cols to 80 and rows to 24', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    spawnPty('bash', 'ls', '/tmp', handlers);

    expect(mockPtySpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cols: 80, rows: 24 }),
    );
  });

  it('clamps cols and rows to minimum of 1', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    spawnPty('bash', 'ls', '/tmp', handlers, -5, -10);

    expect(mockPtySpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cols: 1, rows: 1 }),
    );
  });

  it('uses provided cols and rows', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    spawnPty('vim', 'vim file', '/tmp', handlers, 120, 40);

    expect(mockPtySpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cols: 120, rows: 40 }),
    );
  });

  it('forwards onData from the proc to the handler', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    spawnPty('bash', 'echo hi', '/tmp', handlers);

    const proc = mockPtySpawn.mock.results[0].value as ReturnType<typeof mockPtyProc>;
    proc.emitData('hello\n');
    expect(handlers.onData).toHaveBeenCalledWith(expect.stringMatching(/^pty\d+$/), 'hello\n');
  });

  it('forwards onExit from the proc to the handler', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    spawnPty('bash', 'exit 42', '/tmp', handlers);

    const proc = mockPtySpawn.mock.results[0].value as ReturnType<typeof mockPtyProc>;
    proc.emitExit(42);
    expect(handlers.onExit).toHaveBeenCalledWith(expect.stringMatching(/^pty\d+$/), 42);
  });

  it('write delegates to proc.write', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    const session = spawnPty('bash', 'cat', '/tmp', handlers);

    session.write('hello');
    const proc = mockPtySpawn.mock.results[0].value as ReturnType<typeof mockPtyProc>;
    expect(proc.write).toHaveBeenCalledWith('hello');
  });

  it('resize delegates to proc.resize with clamping', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    const session = spawnPty('bash', 'less', '/tmp', handlers);

    session.resize(100, 50);
    const proc = mockPtySpawn.mock.results[0].value as ReturnType<typeof mockPtyProc>;
    expect(proc.resize).toHaveBeenCalledWith(100, 50);
  });

  it('resize clamps to minimum 1', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    const session = spawnPty('bash', 'less', '/tmp', handlers);

    session.resize(0, -1);
    const proc = mockPtySpawn.mock.results[0].value as ReturnType<typeof mockPtyProc>;
    expect(proc.resize).toHaveBeenCalledWith(1, 1);
  });

  it('resize does not throw when proc has exited', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    const session = spawnPty('bash', 'less', '/tmp', handlers);

    const proc = mockPtySpawn.mock.results[0].value as ReturnType<typeof mockPtyProc>;
    proc.resize.mockImplementationOnce(() => { throw new Error('gone'); });
    expect(() => session.resize(80, 24)).not.toThrow();
  });

  it('kill delegates to proc.kill', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    const session = spawnPty('bash', 'sleep 10', '/tmp', handlers);

    session.kill();
    const proc = mockPtySpawn.mock.results[0].value as ReturnType<typeof mockPtyProc>;
    expect(proc.kill).toHaveBeenCalledOnce();
  });

  it('kill does not throw when proc already exited', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    const session = spawnPty('bash', 'sleep 10', '/tmp', handlers);

    const proc = mockPtySpawn.mock.results[0].value as ReturnType<typeof mockPtyProc>;
    proc.kill.mockImplementationOnce(() => { throw new Error('already dead'); });
    expect(() => session.kill()).not.toThrow();
  });

  it('assigns incrementing ids', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    const a = spawnPty('bash', '', '/tmp', handlers);
    const b = spawnPty('zsh', '', '/tmp', handlers);

    const aNum = Number(a.id.slice(3));
    const bNum = Number(b.id.slice(3));
    expect(bNum).toBe(aNum + 1);
  });

  it('sets name to xterm-256color', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    spawnPty('bash', '', '/tmp', handlers);

    expect(mockPtySpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ name: 'xterm-256color' }),
    );
  });

  it('uses cwd from argument or process.cwd fallback', () => {
    const handlers = { onData: vi.fn(), onExit: vi.fn() };
    spawnPty('bash', '', '/custom/path', handlers);

    expect(mockPtySpawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cwd: '/custom/path' }),
    );
  });
});
