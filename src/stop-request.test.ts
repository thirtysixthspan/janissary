import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  STOP_REQUEST_TICK_MS,
  clearStopRequest,
  stopRequestPath,
  watchStopRequest,
  writeStopRequest,
} from './stop-request.js';

let projectDir: string;
let otherDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(path.join(tmpdir(), 'stop-request-test-'));
  otherDir = mkdtempSync(path.join(tmpdir(), 'stop-request-other-'));
  vi.useFakeTimers();
});

afterEach(() => { vi.useRealTimers(); });

describe('stop request', () => {
  it('writes the recorded pid under the target project only', () => {
    writeStopRequest(projectDir, 424_242);

    expect(stopRequestPath(projectDir)).toBe(path.join(projectDir, '.janissary', 'stop-request'));
    expect(readFileSync(stopRequestPath(projectDir), 'utf8')).toBe('424242\n');
    expect(existsSync(stopRequestPath(otherDir))).toBe(false);
  });

  it('clears a written stop request', () => {
    writeStopRequest(projectDir, process.pid);
    clearStopRequest(projectDir);

    expect(existsSync(stopRequestPath(projectDir))).toBe(false);
  });

  it('shuts down once and removes the request when it names this process', () => {
    const onStop = vi.fn();
    const stopWatching = watchStopRequest(projectDir, onStop);
    writeStopRequest(projectDir, process.pid);

    vi.advanceTimersByTime(STOP_REQUEST_TICK_MS);

    expect(onStop).toHaveBeenCalledExactlyOnceWith();
    expect(existsSync(stopRequestPath(projectDir))).toBe(false);
    vi.advanceTimersByTime(STOP_REQUEST_TICK_MS * 2);
    expect(onStop).toHaveBeenCalledTimes(1);
    stopWatching();
  });

  it('clears a request naming another process without shutting down', () => {
    const onStop = vi.fn();
    const stopWatching = watchStopRequest(projectDir, onStop);
    writeStopRequest(projectDir, process.pid + 1);

    vi.advanceTimersByTime(STOP_REQUEST_TICK_MS);

    expect(onStop).not.toHaveBeenCalled();
    expect(existsSync(stopRequestPath(projectDir))).toBe(false);
    stopWatching();
  });

  it('clears an unreadable request without shutting down', () => {
    mkdirSync(path.join(projectDir, '.janissary'), { recursive: true });
    writeFileSync(stopRequestPath(projectDir), 'garbage');
    const onStop = vi.fn();
    const stopWatching = watchStopRequest(projectDir, onStop);

    vi.advanceTimersByTime(STOP_REQUEST_TICK_MS);

    expect(onStop).not.toHaveBeenCalled();
    expect(existsSync(stopRequestPath(projectDir))).toBe(false);
    stopWatching();
  });

  it('ignores a request written for a different project', () => {
    const onStop = vi.fn();
    const stopWatching = watchStopRequest(projectDir, onStop);
    writeStopRequest(otherDir, process.pid);

    vi.advanceTimersByTime(STOP_REQUEST_TICK_MS * 2);

    expect(onStop).not.toHaveBeenCalled();
    stopWatching();
  });

  it('does nothing while no request exists', () => {
    const onStop = vi.fn();
    const stopWatching = watchStopRequest(projectDir, onStop);

    vi.advanceTimersByTime(STOP_REQUEST_TICK_MS * 3);

    expect(onStop).not.toHaveBeenCalled();
    stopWatching();
  });

  it('stops watching when the returned function is called', () => {
    const onStop = vi.fn();
    const stopWatching = watchStopRequest(projectDir, onStop);
    stopWatching();
    writeStopRequest(projectDir, process.pid);

    vi.advanceTimersByTime(STOP_REQUEST_TICK_MS * 3);

    expect(onStop).not.toHaveBeenCalled();
  });
});
