import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PtyOutputBuffer } from './pty-output-buffer';

const MARKER = '\r\n\u{1B}[0m[earlier output trimmed]\r\n';

const drainAll = (buffer: PtyOutputBuffer, id: string) => {
  const seen: string[] = [];
  buffer.drain(id, (data) => { seen.push(data); });
  return seen;
};

describe('PtyOutputBuffer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('replays retained chunks in arrival order and claims the stream', () => {
    const buffer = new PtyOutputBuffer();
    buffer.record('p1', 'hello');
    buffer.record('p1', ' world');
    expect(drainAll(buffer, 'p1')).toEqual(['hello', ' world']);
    buffer.record('p1', 'more');
    expect(drainAll(buffer, 'p1')).toEqual(['more']);
  });

  it('drops the oldest chunks past the per-stream limit and prepends the marker', () => {
    const buffer = new PtyOutputBuffer({ maxStreamBytes: 15 });
    buffer.record('p1', 'aaaaaaaaaa');
    buffer.record('p1', 'bbbbbbbbbb');
    buffer.record('p1', 'cc');
    expect(drainAll(buffer, 'p1')).toEqual([MARKER, 'bbbbbbbbbb', 'cc']);
  });

  it('repeated records do not stack a second marker', () => {
    const buffer = new PtyOutputBuffer({ maxStreamBytes: 10 });
    buffer.record('p1', 'aaaaaaaaaa');
    buffer.record('p1', 'bbbbbbbbbb');
    buffer.record('p1', 'cc');
    buffer.record('p1', 'dd');
    const seen = drainAll(buffer, 'p1');
    expect(seen.filter((chunk) => chunk === MARKER)).toHaveLength(1);
  });

  it('drops a single chunk larger than the whole limit to the marker alone', () => {
    const buffer = new PtyOutputBuffer({ maxStreamBytes: 10 });
    buffer.record('p1', 'a'.repeat(50));
    expect(drainAll(buffer, 'p1')).toEqual([MARKER]);
  });

  it('evicts the oldest unclaimed streams past the aggregate limit', () => {
    const buffer = new PtyOutputBuffer({ maxTotalBytes: 15 });
    buffer.record('old', 'aaaaaaaaaa');
    buffer.record('mid', 'bbbbbb');
    buffer.record('new', 'c');
    expect(drainAll(buffer, 'old')).toEqual([]);
    expect(drainAll(buffer, 'mid')).toEqual(['bbbbbb']);
    expect(drainAll(buffer, 'new')).toEqual(['c']);
  });

  it('drops an exited stream nobody claimed once the grace period lapses', () => {
    const buffer = new PtyOutputBuffer({ exitedTtlMs: 1000 });
    buffer.record('p1', 'hello');
    buffer.markExited('p1');
    vi.advanceTimersByTime(1000);
    expect(drainAll(buffer, 'p1')).toEqual([]);
  });

  it('keeps an exited stream\'s output for a renderer attaching within the grace period', () => {
    const buffer = new PtyOutputBuffer({ exitedTtlMs: 1000 });
    buffer.record('p1', 'hello');
    buffer.markExited('p1');
    vi.advanceTimersByTime(999);
    expect(drainAll(buffer, 'p1')).toEqual(['hello']);
  });

  it('claiming a stream cancels its expiration timer', () => {
    const buffer = new PtyOutputBuffer({ exitedTtlMs: 1000 });
    buffer.record('p1', 'hello');
    buffer.markExited('p1');
    expect(drainAll(buffer, 'p1')).toEqual(['hello']);
    vi.advanceTimersByTime(5000);
    expect(drainAll(buffer, 'p1')).toEqual([]);
  });

  it('dispose releases retained data and cancels pending expiration timers', () => {
    const buffer = new PtyOutputBuffer({ exitedTtlMs: 1000 });
    buffer.record('p1', 'hello');
    buffer.markExited('p1');
    buffer.dispose();
    vi.advanceTimersByTime(5000);
    expect(drainAll(buffer, 'p1')).toEqual([]);
  });

  it('marking a stream exited twice does not restart the grace period', () => {
    const buffer = new PtyOutputBuffer({ exitedTtlMs: 1000 });
    buffer.record('p1', 'hello');
    buffer.markExited('p1');
    vi.advanceTimersByTime(600);
    buffer.markExited('p1');
    vi.advanceTimersByTime(500);
    expect(drainAll(buffer, 'p1')).toEqual([]);
  });
});
